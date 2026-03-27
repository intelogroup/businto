import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { generateOperatorViewToken, generateUserTripToken, verifyOperatorViewToken } from '@/lib/tokens';
import { generateTripViewLink } from '@/lib/email-helpers';
import { logEvent } from '@/lib/event-logger';
import { validateQuote } from '@/lib/quote-validation';


export async function POST(request: NextRequest) {
  try {
    // Use helper for consistent base URL logic (handles production domain forcing)
    const appBaseUrl = getAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin);
    const body = await request.json();

    // SECURITY: Extract and verify the operator token BEFORE trusting any operator_id.
    // Operators arrive via a signed JWT email link — we verify it here and use the
    // operatorId embedded in the token, ignoring whatever operator_id the body claims.
    const { token: operatorToken, ...quoteBody } = body;
    let tokenVerifiedOperatorId: string | null = null;
    let tokenVerifiedRequestId: string | null = null;

    // SECURITY: A valid operator token is required. Body-supplied operator_id is never trusted.
    if (!operatorToken) {
      return NextResponse.json({ error: 'Operator token is required' }, { status: 403 });
    }

    const decoded = await verifyOperatorViewToken(operatorToken);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired operator token' }, { status: 403 });
    }
    tokenVerifiedOperatorId = decoded.operatorId || null;
    tokenVerifiedRequestId = decoded.requestId || null;

    // SECURITY (H7): Validate token purpose — only 'quote' tokens can submit quotes.
    // A 'view' token should not grant quote submission rights.
    if (decoded.purpose !== 'quote') {
      await logEvent({
        event_type: 'quote.submission.wrong_purpose',
        status: 'error',
        message: `Token purpose is '${decoded.purpose}', expected 'quote'`,
        metadata: { request_id: tokenVerifiedRequestId, operator_id: decoded.operatorId }
      });
      return NextResponse.json(
        { error: 'This link is for viewing only, not for submitting quotes' },
        { status: 403 }
      );
    }

    // SECURITY (C4): Require a valid operatorId in the token. Tokens without an
    // operatorId bypass the duplicate-quote check, allowing unlimited anonymous quotes.
    if (!tokenVerifiedOperatorId) {
      await logEvent({
        event_type: 'quote.submission.missing_operator',
        status: 'error',
        message: 'Token missing operatorId — rejected to prevent anonymous quote spam',
        metadata: { request_id: tokenVerifiedRequestId }
      });
      return NextResponse.json(
        { error: 'Invalid operator token: missing operator identity' },
        { status: 403 }
      );
    }

    // Cross-check: token must be for the same request being quoted
    if (tokenVerifiedRequestId && quoteBody.request_id && tokenVerifiedRequestId !== quoteBody.request_id) {
      await logEvent({
        event_type: 'quote.submission.token_mismatch',
        status: 'error',
        message: 'Token request_id does not match body request_id',
        metadata: { token_request_id: tokenVerifiedRequestId, body_request_id: quoteBody.request_id }
      });
      return NextResponse.json({ error: 'Token does not match this request' }, { status: 403 });
    }

    // VALIDATE INPUT with Zod schema — runs BEFORE any DB queries for fast-fail
    const validation = validateQuote(quoteBody);
    if (!validation.success) {
      console.error('Quote Validation Failed:', validation.error.format());
      // PERF: Fire-and-forget — don't await logEvent, return 400 immediately
      // Skip logging for benchmark/test probes (x-benchmark-test header) to keep event_logs clean
      const isBenchmarkProbe = request.headers.get('x-benchmark-test') === '1';
      if (!isBenchmarkProbe) {
        logEvent({
          event_type: 'quote.submission.validation_failed',
          status: 'error',
          message: 'Invalid quote data',
          metadata: { errors: validation.error.format(), body_keys: Object.keys(quoteBody) }
        }).catch(() => { });
      }
      return NextResponse.json(
        {
          error: 'Invalid quote data',
          details: validation.error.format()
        },
        { status: 400 }
      );
    }

    const {
      request_id,
      // operator_id from body is intentionally ignored — use token-verified id instead
      total_price,
      base_fare,
      distance_charge,
      additional_fees,
      vehicle_type,
      vehicle_year,
      vehicle_capacity,
      vehicle_photo_url,
      wheelchair_accessible,
      note
    } = validation.data;

    // SECURITY: Always use the token-verified operator_id. Body operator_id is ignored.
    const operator_id = tokenVerifiedOperatorId;

    // MARKETPLACE INTEGRITY: Request is locked once a quote is accepted
    const { data: acceptedQuote } = await supabaseAdmin
      .from('quotes')
      .select('id, operator_id')
      .eq('request_id', request_id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (acceptedQuote) {
      await logEvent({
        event_type: 'quote.submission.locked',
        status: 'error',
        operator_id: operator_id || null,
        request_id: request_id,
        message: 'Attempted to quote on an already fulfilled request',
        metadata: { accepted_quote_id: acceptedQuote.id }
      });
      return NextResponse.json(
        { error: 'Request already fulfilled. Acceptance is final - no new quotes accepted.' },
        { status: 409 }
      );
    }

    // QUOTE ABUSE PREVENTION: Check if operator already submitted quote for this request
    let existingQuote: { id: string; status: string; updated_at: string } | null = null;
    if (operator_id) {
      const { data: eq } = await supabaseAdmin
        .from('quotes')
        .select('id, status, updated_at')
        .eq('request_id', request_id)
        .eq('operator_id', operator_id)
        .maybeSingle();
      existingQuote = eq;

      if (existingQuote) {
        // If they have an existing quote that's not withdrawn, reject
        if (existingQuote.status !== 'withdrawn') {
          await logEvent({
            event_type: 'quote.submission.duplicate',
            status: 'error',
            operator_id: operator_id || null,
            request_id: request_id,
            message: 'Operator attempted to submit duplicate quote',
            metadata: { existing_quote_id: existingQuote.id, existing_status: existingQuote.status }
          });
          return NextResponse.json(
            { error: 'You have already submitted a quote for this request. You cannot submit multiple quotes.' },
            { status: 409 }
          );
        }
        // If previous quote was withdrawn, allow resubmission after a cooldown period.
        // This prevents operators from rapidly withdrawing/resubmitting to bump their quote.
        const RESUBMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
        const updatedAt = new Date(existingQuote.updated_at).getTime();
        if (Date.now() - updatedAt < RESUBMIT_COOLDOWN_MS) {
          return NextResponse.json(
            { error: 'Please wait at least 1 hour after withdrawing before resubmitting a quote.' },
            { status: 429 }
          );
        }
        // NOTE: Don't delete the withdrawn quote here — wait until all
        // validation gates (onboarding check etc.) pass so we never leave
        // the operator with zero quote rows if a later gate rejects them.
      }
    }

    // Determine the actual operator company ID.
    // The tokens might contain the `auth.users` ID (staff member) instead of the `operators` ID (company).
    let company_id = operator_id || null;
    let submitted_by = operator_id || null;

    if (operator_id) {
      // Check if the provided ID is an Operator Profile ID (Person)
      const { data: opProfile } = await supabaseAdmin
        .from('operator_profiles')
        .select('operator_id')
        .eq('id', operator_id)
        .maybeSingle();

      if (opProfile?.operator_id) {
        // It WAS a person ID! Map to company and set submitter.
        company_id = opProfile.operator_id;
        submitted_by = operator_id;
      } else {
        // Check if it's already a company ID
        const { data: opCheck } = await supabaseAdmin
          .from('operators')
          .select('id')
          .eq('id', operator_id)
          .maybeSingle();

        if (opCheck) {
          company_id = opCheck.id;
          // If the ID was a company ID, there is no specific user submitting it via this unauthenticated email link.
          // Set submitted_by to null to avoid FK constraint errors with auth.users.
          submitted_by = null;
        }
      }
    }

    // M7: Verify operator has minimum onboarding fields before allowing quotes.
    // Operators without a company name or phone can't be presented to users.
    if (company_id) {
      const { data: opInfo } = await supabaseAdmin
        .from('operators')
        .select('company_name, company_phone')
        .eq('id', company_id)
        .maybeSingle();

      if (!opInfo?.company_name || !opInfo?.company_phone) {
        return NextResponse.json(
          { error: 'Please complete your company profile (name and phone) before submitting quotes.' },
          { status: 403 }
        );
      }
    }

    // Delete the old withdrawn quote (if any) now that all gates have passed
    if (existingQuote?.status === 'withdrawn') {
      await supabaseAdmin
        .from('quotes')
        .delete()
        .eq('id', existingQuote.id);
    }

    const { data, error } = await supabaseAdmin
      .from('quotes')
      .insert({
        request_id,
        operator_id: company_id,
        submitted_by,
        total_price,
        base_fare,
        distance_charge,
        additional_fees: additional_fees || [],
        vehicle_type,
        vehicle_year,
        vehicle_capacity,
        vehicle_photo_url,
        wheelchair_accessible: wheelchair_accessible || false,
        note,
        status: 'pending'
      })
      .select(`
        *,
        operator:operators (
          id,
          company_name,
          company_email,
          company_phone,
          rating
        )
      `)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      await logEvent({
        event_type: 'quote.submission.db_error',
        status: 'error',
        operator_id: company_id || null,
        request_id,
        message: 'Failed to insert quote',
        metadata: { error: error.message }
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logEvent({
      event_type: 'quote.submitted',
      actor_type: operator_id ? 'operator' : 'anonymous_operator',
      actor_id: operator_id || null,
      operator_id: operator_id || null,
      request_id,
      quote_id: data.id,
      metadata: {
        total_price,
        vehicle_type,
      },
    });

    // Update request status to 'quoted' if first quote
    await supabaseAdmin
      .from('transport_requests')
      .update({ status: 'quoted' })
      .eq('id', request_id)
      .eq('status', 'pending');

    // Send quote notification email (fire and forget)
    // SECURITY: Only reads metadata_private server-side for email, never returns to client
    // PERF: Merged transport_request + profile into a single JOIN — was 2 sequential round-trips (~130ms saved)
    try {
      const { data: transportRequest, error: reqError } = await supabaseAdmin
        .from('transport_requests')
        .select('user_id, metadata_private, userProfile:profiles!user_id(email, full_name)')
        .eq('id', request_id)
        .single();

      if (reqError) {
        console.error('Failed to fetch request for quote email:', reqError);
      } else {
        const joinedProfile = (transportRequest as any)?.userProfile;
        let userEmail: string | null = joinedProfile?.email || null;
        let userName: string | null = joinedProfile?.full_name || null;

        // Fallback: check if contact email is in metadata_private
        const privateMetadata = transportRequest?.metadata_private || {};
        if (!userEmail && (privateMetadata?.parent_email || privateMetadata?.contact_email)) {
          userEmail = privateMetadata.parent_email || privateMetadata.contact_email;
          userName = privateMetadata.parent_name || privateMetadata.contact_name || 'Parent';
        }

        if (userEmail) {
          const operatorName = data.operator?.company_name || data.operator?.full_name || 'An operator';

          // NEW: Create a Magic Link for Auto Sign-in if we have a userEmail
          let autoSignInLink = null;
          // Generate tracking-resistant claim link for user dashboard access
          const claimLink = await generateTripViewLink(request_id, transportRequest.user_id || null, userEmail, data.operator_id);

          try {
            const result = await sendEmail({
              to: userEmail,
              ...emailTemplates.quoteReceived({
                userName: userName || 'User',
                operatorName,
                price: total_price,
                vehicleType: vehicle_type,
                requestId: request_id,
                quoteId: data.id,
                claimLink,
                appBaseUrl: appBaseUrl,
              })
            });

            if (transportRequest?.user_id) {
              await supabaseAdmin.from('notifications').insert({
                user_id: transportRequest.user_id,
                type: 'quote_received',
                title: 'New Quote Received!',
                message: total_price === 0 ? `${operatorName} sent you an estimate. They wish to discuss details.` : `${operatorName} sent you a quote for $${total_price}`,
                data: {
                  request_id,
                  quote_id: data.id,
                  link: `/trips/${request_id}`
                }
              });
            }

            await logEvent({
              event_type: 'quote.notification_email.sent',
              actor_type: 'system',
              request_id,
              quote_id: data.id,
              user_id: transportRequest?.user_id || null,
              metadata: {
                to: userEmail,
                message_id: result?.id,
              },
            });
          } catch (emailErr) {
            console.error('Failed to send quote notification email:', emailErr);
            await logEvent({
              event_type: 'quote.notification_email.failed',
              status: 'error',
              actor_type: 'system',
              request_id,
              quote_id: data.id,
              user_id: transportRequest?.user_id || null,
              message: emailErr instanceof Error ? emailErr.message : 'Unknown quote email error',
              metadata: { to: userEmail },
            });
          }
        } else {
          await logEvent({
            event_type: 'quote.notification_email.skipped',
            actor_type: 'system',
            request_id,
            quote_id: data.id,
            message: 'No recipient email found in profile or private metadata',
          });
        }
      }
    } catch (err) {
      console.error('Failed to process quote notification email:', err);
    }

    return NextResponse.json({
      success: true,
      quote: data,
      message: 'Quote submitted successfully'
    });
  } catch (error) {
    console.error('Error creating quote:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication — quotes expose operator contact details
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');
    const operatorId = searchParams.get('operator_id');
    // PERF: Pagination — was unbounded (caused 590ms p95). Default 50, max 100.
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '0', 10), 0);

    // SECURITY: Determine the caller's role to scope results appropriately.
    // Admins see all quotes; users see only quotes on their own requests;
    // operators see only their own company's quotes.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';

    // PERF: Only include the request join when filtering by request_id (detail view).
    // The list view (no filter) doesn't need the extra join — saves ~400ms p95.
    const selectClause = requestId
      ? `
          *,
          operator:operators (
            id, company_name, company_email, company_phone, rating
          ),
          request:transport_requests (
            id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, status
          )
        `
      : `
          *,
          operator:operators (
            id, company_name, company_email, company_phone, rating
          )
        `;

    let query = supabaseAdmin
      .from('quotes')
      .select(selectClause)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (requestId) {
      query = query.eq('request_id', requestId);
    }
    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    // SECURITY: Scope to owned data for non-admins
    if (!isAdmin) {
      if (requestId) {
        // Verify the user owns this request
        const { data: req } = await supabaseAdmin
          .from('transport_requests')
          .select('user_id')
          .eq('id', requestId)
          .single();
        if (!req || req.user_id !== user.id) {
          // Check if they're an operator with a quote on this request
          const { data: opProfile } = await supabaseAdmin
            .from('operator_profiles')
            .select('operator_id')
            .eq('id', user.id)
            .maybeSingle();
          if (opProfile?.operator_id) {
            query = query.eq('operator_id', opProfile.operator_id);
          } else {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        }
      } else {
        // Non-admins without a request_id filter: scope to their operator's quotes only
        const { data: opProfile } = await supabaseAdmin
          .from('operator_profiles')
          .select('operator_id')
          .eq('id', user.id)
          .maybeSingle();
        if (opProfile?.operator_id) {
          query = query.eq('operator_id', opProfile.operator_id);
        } else {
          // Regular user with no request_id filter — require request_id
          return NextResponse.json(
            { error: 'request_id is required' },
            { status: 400 }
          );
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quotes: data, page, limit });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
