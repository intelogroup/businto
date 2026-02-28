import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { sendEmail, emailTemplates } from '@/lib/email';
import { findMatchingOperators, extractRequirements } from '@/lib/operator-matching';
import { splitAndValidateMetadata, detectPrivateFieldsInSafe } from '@/lib/validation';
import { generateOperatorViewToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  try {
    // ── Auth: derive user identity from session, never trust client ──────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    // Allow unauthenticated requests but track them clearly
    const user_id = user?.id ?? null;
    // ─────────────────────────────────────────────────────────────────────

    // Base URL for links (prefer env var, then origin)
    let appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // Safety check: never allow localhost URLs in operator emails
    if (appBaseUrl.includes('localhost') || appBaseUrl.includes('127.0.0.1')) {
      appBaseUrl = 'https://businto.vercel.app';
    }
    const body = await request.json();
    const {
      service_type,
      pickup_address,
      dropoff_address,
      pickup_fuzzy,
      dropoff_fuzzy,
      start_date,
      start_time,
      end_date,
      is_recurring,
      recurrence_pattern,
      metadata,
      end_time,
      payment_method_id, // New field for serious lead payment
    } = body;

    if (!service_type || !pickup_address || !dropoff_address || !start_date) {
      return NextResponse.json(
        { error: 'Missing required fields: service_type, pickup_address, dropoff_address, start_date' },
        { status: 400 }
      );
    }

    // Validate service type
    if (!['school', 'medical', 'wedding', 'corporate'].includes(service_type)) {
      return NextResponse.json(
        { error: `Invalid service_type: ${service_type}` },
        { status: 400 }
      );
    }

    // CRITICAL: Split and validate metadata with fail-closed approach
    let metadata_safe = {};
    let metadata_private = {};

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        const split = splitAndValidateMetadata(metadata, service_type);
        metadata_safe = split.metadata_safe;
        metadata_private = split.metadata_private;

        // Extra safety check: detect if any private-looking fields leaked
        const leaked = detectPrivateFieldsInSafe(metadata_safe, service_type);
        if (leaked.length > 0) {
          console.error('🔴 SECURITY VIOLATION: Private fields in safe metadata:', leaked);
          return NextResponse.json(
            { error: `Security violation: fields ${leaked.join(', ')} cannot be in safe metadata` },
            { status: 400 }
          );
        }

      } catch (validationError: any) {
        console.error('Metadata validation failed:', validationError);
        return NextResponse.json(
          { error: `Metadata validation failed: ${validationError.message}` },
          { status: 400 }
        );
      }
    }

    // Affiliate Priority Window Logic
    // Care (medical) rides get a 15 min head-start for affiliates.
    // School/Event/Corporate get a 60 min head-start.
    const priorityMinutes = service_type === 'medical' ? 15 : 60;
    const priority_window_ends_at = new Date(Date.now() + priorityMinutes * 60 * 1000).toISOString();

    // User Priority and Payment Logic
    // If the user provided a payment method (even a mock one for testing), 
    // we activate the 30-minute priority window.
    const hasPaid = !!payment_method_id;
    const priority_until = hasPaid ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
    const payment_status = hasPaid ? 'paid' : 'pending';

    const { data, error } = await supabaseAdmin
      .from('transport_requests')
      .insert({
        service_type,
        pickup_address,
        dropoff_address,
        pickup_fuzzy: pickup_fuzzy || pickup_address.split(',')[0],
        dropoff_fuzzy: dropoff_fuzzy || dropoff_address.split(',')[0],
        start_date,
        start_time,
        end_date,
        end_time,
        is_recurring: is_recurring || false,
        recurrence_pattern,
        metadata_safe,
        metadata_private,
        // Keep old metadata field for backward compat during transition
        metadata: metadata || {},
        user_id,
        status: 'pending',
        payment_status,
        priority_until,
        priority_window_ends_at,
        routing_fee_amount: 1.99
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logEvent({
      event_type: 'request.created',
      actor_type: user_id ? 'user' : 'system',
      actor_id: user_id || null,
      user_id: user_id || null,
      request_id: data.id,
      metadata: {
        service_type,
        pickup_fuzzy: data.pickup_fuzzy,
        dropoff_fuzzy: data.dropoff_fuzzy,
        has_priority: !!priority_until
      },
    });

    // Store email preview URLs to return in response
    const emailPreviewUrls: string[] = [];

    // Send confirmation email (fire and forget - don't block response)
    if (user_id) {
      try {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('email, full_name')
          .eq('id', user_id)
          .single();

        if (profileError) {
          console.error('Failed to fetch user profile:', profileError);
        } else if (profile?.email) {
          const serviceTypeMap: Record<string, string> = {
            school: 'School Transportation',
            medical: 'Medical Transportation',
            wedding: 'Event Shuttle',
            corporate: 'Corporate Travel'
          };

          try {
            const result = await sendEmail({
              to: profile.email,
              ...emailTemplates.requestConfirmation({
                userName: profile.full_name || 'User',
                serviceType: serviceTypeMap[service_type] || service_type,
                pickupAddress: pickup_fuzzy || pickup_address,
                dropoffAddress: dropoff_fuzzy || dropoff_address,
                date: start_date,
                requestId: data.id,
              })
            });

            await logEvent({
              event_type: 'request.confirmation_email.sent',
              actor_type: 'system',
              user_id: user_id || null,
              request_id: data.id,
              metadata: {
                to: profile.email,
                message_id: result?.id,
              },
            });
          } catch (emailErr) {
            console.error('Failed to send confirmation email:', emailErr);
            await logEvent({
              event_type: 'request.confirmation_email.failed',
              status: 'error',
              actor_type: 'system',
              user_id: user_id || null,
              request_id: data.id,
              message: emailErr instanceof Error ? emailErr.message : 'Unknown email error',
            });
          }
        }
      } catch (err) {
        console.error('Failed to process user confirmation email:', err);
      }
    }

    // Notify matching operators immediately (blocks for DB lookup, then fire-and-forget emails)
    let matchedOperatorsCount = 0;
    try {
      const operators = await findMatchingOperators({
        service_type,
        pickup_address,
        pickup_fuzzy,
        dropoff_address,
        dropoff_fuzzy,
        metadata
      });

      matchedOperatorsCount = operators.length;

      const requirements = extractRequirements(service_type, metadata);

      // Fallback mechanism: if no operators found for specialized requests, notify admins for manual review
      if (operators.length === 0) {
        console.log(`⚠️ No matching operators for request ${data.id}. Firing admin fallback notification.`);
        try {
          // You can also change the request status or add a flag so admins know it requires review.
          // For now, we update a flag in metadata_private
          await supabaseAdmin
            .from('transport_requests')
            .update({
              metadata_private: { ...metadata_private, requires_manual_allocation: true }
            })
            .eq('id', data.id);

          await sendEmail({
            to: process.env.ADMIN_EMAIL || 'admin@businto.com',
            subject: `URGENT: Manual Allocation Required for Request #${data.id.substring(0, 8)}`,
            html: `
              <h2>Action Required: No Automated Matches Found</h2>
              <p>A specialized transport request was submitted and no operators matched the strict criteria.</p>
              <ul>
                <li><strong>Service Type:</strong> ${service_type}</li>
                <li><strong>Pickup:</strong> ${pickup_address}</li>
                <li><strong>Dropoff:</strong> ${dropoff_address}</li>
                <li><strong>Date:</strong> ${start_date}</li>
                <li><strong>Requirements:</strong> ${requirements.join(', ')}</li>
              </ul>
              <p>Please log in to the admin dashboard to match this request manually or provide a quote.</p>
            `,
          });

          await logEvent({
            event_type: 'request.manual_allocation.flagged',
            actor_type: 'system',
            request_id: data.id,
          });
        } catch (err) {
          console.error('Failed to handle unmatched request fallback:', err);
        }

        // Generate response even in fallback case to avoid "Unexpected end of JSON input"
        const sanitizedRequest = {
          id: data.id,
          service_type: data.service_type,
          pickup_fuzzy: data.pickup_fuzzy,
          dropoff_fuzzy: data.dropoff_fuzzy,
          start_date: data.start_date,
          start_time: data.start_time,
          end_date: data.end_date,
          end_time: data.end_time,
          is_recurring: data.is_recurring,
          recurrence_pattern: data.recurrence_pattern,
          metadata_safe: data.metadata_safe,
          status: data.status,
          created_at: data.created_at,
          payment_status: data.payment_status,
          priority_until: data.priority_until,
          routing_fee_amount: data.routing_fee_amount,
          matched_operators_count: 0
        };

        return NextResponse.json({
          success: true,
          request: sanitizedRequest,
          paymentUrl: undefined,
          message: 'Transport request created and flagged for manual review',
        });
      }

      // Affiliate Priority Window Logic:
      // ALL new requests go to partners/affiliates FIRST for the duration of priority_window_ends_at.
      const operatorsToNotify = operators.filter(op => op.is_partner);

      console.log('\n🔔 ==========================================');
      console.log(`🔔 Found ${operators.length} matching operators for request ${data.id}`);
      console.log(`🔔 Priority Head-Start Active for Affiliates.`);
      console.log(`🔔 Notifying ${operatorsToNotify.length} eligible Affiliate operators initially`);
      console.log('🔔 ==========================================\n');

      const serviceTypeMap: Record<string, string> = {
        school: 'School Transportation',
        medical: 'Medical Transportation',
        wedding: 'Event Shuttle',
        corporate: 'Corporate Travel'
      };

      const serviceTypeDisplay = serviceTypeMap[service_type] || service_type;

      // Send email to each matching operator
      for (const operator of operatorsToNotify) {
        try {
          // Generate signed token for operator access (7 day expiry)
          const accessToken = await generateOperatorViewToken(
            data.id,
            operator.id,
            'quote',
            7
          );

          const emailResult = await sendEmail({
            to: operator.company_email,
            ...emailTemplates.operatorNewRequest({
              operatorName: operator.company_name,
              serviceType: service_type,
              serviceTypeDisplay,
              pickupAddress: pickup_address,
              dropoffAddress: dropoff_address,
              pickupFuzzy: pickup_fuzzy || pickup_address.split(',')[0],
              dropoffFuzzy: dropoff_fuzzy || dropoff_address.split(',')[0],
              date: new Date(start_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }),
              time: start_time,
              scheduleType: metadata?.schedule_type,
              studentCount: metadata?.student_count,
              requirements,
              requestId: data.id,
              accessToken, // Pass token to email template
              appBaseUrl
            })
          });

          await logEvent({
            event_type: 'operator.request_email.sent',
            actor_type: 'system',
            operator_id: operator.id,
            request_id: data.id,
            metadata: {
              operator_name: operator.company_name,
              to: operator.company_email,
              message_id: emailResult?.id,
              is_partner: operator.is_partner
            },
          });

          if (emailResult.previewUrl) {
            emailPreviewUrls.push(emailResult.previewUrl);
          }

          // Create in-app notification for operator
          await supabaseAdmin.from('notifications').insert({
            user_id: operator.profile_id,
            type: 'new_request_available',
            title: `New ${serviceTypeDisplay} Request`,
            message: `${pickup_fuzzy || pickup_address.split(',')[0]} → ${dropoff_fuzzy || dropoff_address.split(',')[0]}`,
            data: {
              request_id: data.id,
              service_type,
              pickup_fuzzy: pickup_fuzzy || pickup_address.split(',')[0],
              dropoff_fuzzy: dropoff_fuzzy || dropoff_address.split(',')[0]
            }
          });

          console.log(`✓ Notified operator: ${operator.company_name} (Partner: ${operator.is_partner})`);
        } catch (err) {
          console.error(`Failed to notify operator ${operator.company_name}:`, err);
        }
      }

      console.log(`Operator notification complete for request ${data.id}`);
    } catch (matchErr) {
      console.error('Failed to match/notify operators:', matchErr);
    }

    let paymentUrl: string | undefined;

    // Generate checkout URL if payment is pending AND we matched at least one operator
    if (payment_status === 'pending' && matchedOperatorsCount > 0) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Serious Lead Priority',
                  description: 'Notify partners immediately and get 30-minute priority.',
                },
                unit_amount: 199,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${appUrl}/?request_id=${data.id}&payment_success=true`,
          cancel_url: `${appUrl}/?request_id=${data.id}&payment_cancelled=true`,
          metadata: {
            request_id: data.id,
            type: 'priority_fee'
          }
        });
        paymentUrl = session.url ?? undefined;
      } catch (stripeErr) {
        console.error('Failed to create Stripe session:', stripeErr);
      }
    }

    // Return sanitized response - exclude private data
    // Users get their own data, but we follow principle of least privilege
    const sanitizedRequest = {
      id: data.id,
      service_type: data.service_type,
      pickup_fuzzy: data.pickup_fuzzy,
      dropoff_fuzzy: data.dropoff_fuzzy,
      start_date: data.start_date,
      start_time: data.start_time,
      end_date: data.end_date,
      end_time: data.end_time,
      is_recurring: data.is_recurring,
      recurrence_pattern: data.recurrence_pattern,
      metadata_safe: data.metadata_safe,
      status: data.status,
      created_at: data.created_at,
      payment_status: data.payment_status,
      priority_until: data.priority_until,
      routing_fee_amount: data.routing_fee_amount,
      matched_operators_count: matchedOperatorsCount
    };

    return NextResponse.json({
      success: true,
      request: sanitizedRequest,
      paymentUrl,
      message: 'Transport request created successfully',
      emailPreviewUrls: emailPreviewUrls.length > 0 ? emailPreviewUrls : undefined
    });
  } catch (error) {
    console.error('Error creating transport request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth: derive user identity from session ───────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // ─────────────────────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Select only safe fields - never expose metadata_private or exact addresses
    let query = supabaseAdmin
      .from('transport_requests')
      .select(`
        id,
        service_type,
        pickup_fuzzy,
        dropoff_fuzzy,
        start_date,
        start_time,
        end_date,
        is_recurring,
        recurrence_pattern,
        metadata_safe,
        status,
        created_at,
        user_id,
        quotes (
          id,
          total_price,
          base_fare,
          distance_charge,
          vehicle_type,
          vehicle_year,
          vehicle_capacity,
          wheelchair_accessible,
          note,
          status,
          created_at,
          operator:profiles!quotes_operator_id_fkey (
            id,
            full_name,
            company_name,
            avatar_url
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Always filter by session user — never trust client-supplied user_id
    if (user?.id) {
      query = query.eq('user_id', user.id);
    } else {
      // Unauthenticated callers see nothing
      return NextResponse.json({ requests: [] });
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: data });
  } catch (error) {
    console.error('Error fetching transport requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
