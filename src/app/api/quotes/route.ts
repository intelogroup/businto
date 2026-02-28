import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates } from '@/lib/email';
import { generateOperatorViewToken, generateUserTripToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';
import { validateQuote } from '@/lib/quote-validation';


export async function POST(request: NextRequest) {
  try {
    // Base URL for links (prefer env var, then origin)
    let appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // Safety check: never allow localhost URLs in emails
    if (appBaseUrl.includes('localhost') || appBaseUrl.includes('127.0.0.1')) {
      appBaseUrl = 'https://businto.vercel.app';
    }
    const body = await request.json();

    // VALIDATE INPUT with Zod schema
    const validation = validateQuote(body);
    if (!validation.success) {
      console.error('🔴 Quote Validation Failed:', validation.error.format());
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
      operator_id,
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

    // MARKETPLACE INTEGRITY: Request is locked once a quote is accepted
    const { data: acceptedQuote } = await supabaseAdmin
      .from('quotes')
      .select('id, operator_id')
      .eq('request_id', request_id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (acceptedQuote) {
      return NextResponse.json(
        { error: 'Request already fulfilled. Acceptance is final - no new quotes accepted.' },
        { status: 409 }
      );
    }

    // QUOTE ABUSE PREVENTION: Check if operator already submitted quote for this request
    if (operator_id) {
      const { data: existingQuote } = await supabaseAdmin
        .from('quotes')
        .select('id, status')
        .eq('request_id', request_id)
        .eq('operator_id', operator_id)
        .maybeSingle();

      if (existingQuote) {
        // If they have an existing quote that's not withdrawn, reject
        if (existingQuote.status !== 'withdrawn') {
          return NextResponse.json(
            { error: 'You have already submitted a quote for this request. You cannot submit multiple quotes.' },
            { status: 409 }
          );
        }
        // If previous quote was withdrawn, allow resubmission but delete the old one
        await supabaseAdmin
          .from('quotes')
          .delete()
          .eq('id', existingQuote.id);
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
          // Submitter remains whatever was passed (likely the profile_id linked to the company)
        }
      }
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
    try {
      const { data: transportRequest, error: reqError } = await supabaseAdmin
        .from('transport_requests')
        .select('user_id, metadata_private')
        .eq('id', request_id)
        .single();

      if (reqError) {
        console.error('Failed to fetch request for quote email:', reqError);
      } else {
        let userEmail = null;
        let userName = null;

        if (transportRequest?.user_id) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('email, full_name')
            .eq('id', transportRequest.user_id)
            .single();

          userEmail = profile?.email;
          userName = profile?.full_name;
        }

        // Fallback: check if contact email is in metadata_private
        const privateMetadata = transportRequest?.metadata_private || {};
        if (!userEmail && (privateMetadata?.parent_email || privateMetadata?.contact_email)) {
          userEmail = privateMetadata.parent_email || privateMetadata.contact_email;
          userName = privateMetadata.parent_name || privateMetadata.contact_name || 'Parent';
        }

        if (userEmail) {
          const operatorName = data.operator?.company_name || data.operator?.full_name || 'An operator';

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
                accessToken: await generateUserTripToken(request_id, transportRequest.user_id || undefined),
                appBaseUrl,
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
          console.log('⚠️ No email found for quote notification - request has no user_id or contact email in metadata_private');
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
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');
    const operatorId = searchParams.get('operator_id');

    let query = supabaseAdmin
      .from('quotes')
      .select(`
        *,
        operator:operators (
          id,
          company_name,
          company_email,
          company_phone,
          rating
        ),
        request:transport_requests (
          id,
          service_type,
          pickup_fuzzy,
          dropoff_fuzzy,
          start_date,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (requestId) {
      query = query.eq('request_id', requestId);
    }
    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quotes: data });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
