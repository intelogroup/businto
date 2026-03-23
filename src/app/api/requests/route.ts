import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { sendSMS, smsTemplates } from '@/lib/sms';
import { findMatchingOperators, extractRequirements } from '@/lib/operator-matching';
import { splitAndValidateMetadata, detectPrivateFieldsInSafe } from '@/lib/validation';
import { generateOperatorViewToken, generateUserTripToken } from '@/lib/tokens';
import { generateOperatorQuoteLink, generateTripViewLink } from '@/lib/email-helpers';
import { logEvent } from '@/lib/event-logger';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
import { getDispatchMode } from '@/lib/app-settings';

// ─── Dev-only perf timing helper ─────────────────────────────────────────────
const IS_DEV_PERF = process.env.NODE_ENV !== 'production' || process.env.ENABLE_PERF_TRACE === '1';
function mark(label: string) { if (IS_DEV_PERF) performance.mark(label); }
function measure(name: string, start: string, end: string) {
  if (!IS_DEV_PERF) return 0;
  try {
    const m = performance.measure(name, start, end);
    return Math.round(m.duration);
  } catch { return 0; }
}

export async function POST(request: NextRequest) {
  const reqStart = `req-start-${Date.now()}`;
  mark(reqStart);
  const perfTrace: Record<string, number> = {};

  try {
    // ── Auth: derive user identity from session, never trust client ──────
    mark('auth-start');
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    // Allow unauthenticated requests but track them clearly
    const user_id = user?.id ?? null;
    mark('auth-end');
    perfTrace.auth_ms = measure('auth', 'auth-start', 'auth-end');
    // ─────────────────────────────────────────────────────────────────────

    // Use helper for consistent base URL logic (handles production domain forcing)
    const appBaseUrl = getAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin);
    const body = await request.json();
    const {
      service_type,
      pickup_address,
      dropoff_address,
      pickup_fuzzy,
      dropoff_fuzzy,
      pickup_lat: bodyPickupLat,
      pickup_lng: bodyPickupLng,
      dropoff_lat: bodyDropoffLat,
      dropoff_lng: bodyDropoffLng,
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
        await logEvent({
          event_type: 'request.validation_failed',
          status: 'error',
          actor_id: user_id,
          message: `Metadata validation failed: ${validationError.message}`,
          metadata: { service_type, body_keys: Object.keys(body) }
        });
        return NextResponse.json(
          { error: `Metadata validation failed: ${validationError.message}` },
          { status: 400 }
        );
      }
    }

    // Calculate driving distance and duration using provided coordinates or geocoding fallback
    let pickup_lat: number | null = bodyPickupLat ?? null;
    let pickup_lng: number | null = bodyPickupLng ?? null;
    let dropoff_lat: number | null = bodyDropoffLat ?? null;
    let dropoff_lng: number | null = bodyDropoffLng ?? null;
    let distance_miles: number | null = null;
    let duration_mins: number | null = null;

    mark('geocode-start');
    try {
      if (!pickup_lat || !pickup_lng) {
        mark('geocode-pickup-start');
        const coords = await geocodeToCoords(pickup_address);
        mark('geocode-pickup-end');
        perfTrace.geocode_pickup_ms = measure('geocode-pickup', 'geocode-pickup-start', 'geocode-pickup-end');
        if (coords) { pickup_lat = coords.lat; pickup_lng = coords.lng; }
      }
      if (!dropoff_lat || !dropoff_lng) {
        mark('geocode-dropoff-start');
        const coords = await geocodeToCoords(dropoff_address);
        mark('geocode-dropoff-end');
        perfTrace.geocode_dropoff_ms = measure('geocode-dropoff', 'geocode-dropoff-start', 'geocode-dropoff-end');
        if (coords) { dropoff_lat = coords.lat; dropoff_lng = coords.lng; }
      }
      if (pickup_lat && pickup_lng && dropoff_lat && dropoff_lng) {
        mark('osrm-start');
        const route = await calculateRoute(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
        mark('osrm-end');
        perfTrace.osrm_ms = measure('osrm', 'osrm-start', 'osrm-end');
        if (route) {
          distance_miles = parseFloat(route.distance_miles.toFixed(2));
          duration_mins = route.duration_mins;
        }
      }
    } catch (routeErr) {
      console.error('Route calculation failed (non-fatal):', routeErr);
    }
    mark('geocode-end');
    perfTrace.geocode_total_ms = measure('geocode-total', 'geocode-start', 'geocode-end');

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

    mark('db-insert-request-start');
    const { data, error } = await supabaseAdmin
      .from('transport_requests')
      .insert({
        service_type,
        pickup_address,
        dropoff_address,
        pickup_fuzzy: pickup_fuzzy || pickup_address.split(',')[0],
        dropoff_fuzzy: dropoff_fuzzy || dropoff_address.split(',')[0],
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        distance_miles,
        duration_mins,
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

    mark('db-insert-request-end');
    perfTrace.db_insert_request_ms = measure('db-insert-request', 'db-insert-request-start', 'db-insert-request-end');

    if (error) {
      console.error('Supabase error:', error);
      await logEvent({
        event_type: 'request.db_error',
        status: 'error',
        actor_id: user_id,
        message: 'Failed to insert transport_request',
        metadata: { error: error.message, service_type }
      });
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
    const privateMeta = metadata_private as any;
    const guestEmail = privateMeta.parent_email || privateMeta.contact_email;
    const guestName = privateMeta.parent_name || privateMeta.contact_name || 'User';

    if (user_id || guestEmail) {
      try {
        let recipientEmail = guestEmail;
        let recipientName = guestName;

        if (user_id) {
          const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('email, full_name')
            .eq('id', user_id)
            .single();

          if (!profileError && profile?.email) {
            recipientEmail = profile.email;
            recipientName = profile.full_name || recipientName;
          }
        }

        if (recipientEmail) {
          const serviceTypeMap: Record<string, string> = {
            school: 'School Transportation',
            medical: 'Medical Transportation',
            wedding: 'Event Shuttle',
            corporate: 'Corporate Travel'
          };

          try {
            // Generate tracking-resistant claim link for user dashboard access
            const claimLink = await generateTripViewLink(data.id, user_id, recipientEmail);

            const result = await sendEmail({
              to: recipientEmail,
              ...emailTemplates.requestConfirmation({
                userName: recipientName,
                serviceType: serviceTypeMap[service_type] || service_type,
                pickupAddress: pickup_fuzzy || pickup_address,
                dropoffAddress: dropoff_fuzzy || dropoff_address,
                date: start_date,
                requestId: data.id,
                claimLink,
                appBaseUrl
              })
            });

            await logEvent({
              event_type: 'request.confirmation_email.sent',
              actor_type: 'system',
              user_id: user_id || null,
              request_id: data.id,
              metadata: {
                to: recipientEmail,
                message_id: result?.id,
                is_guest: !user_id
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
        console.error('Failed to process confirmation email:', err);
      }
    }

    // Notify matching operators immediately (blocks for DB lookup, then fire-and-forget emails)
    let matchedOperatorsCount = 0;
    try {
      // Check if manual dispatch mode is on — if so, notify admin instead of operators
      // PERF: Uses cached setting (60s TTL) — avoids a 135ms DB hit on every request
      const isManualDispatch = await getDispatchMode();

      if (isManualDispatch) {
        console.log(`[Manual Dispatch] Mode ON — skipping auto operator notifications for request ${data.id}`);

        // Flag request for Safety Valve queue
        await supabaseAdmin
          .from('transport_requests')
          .update({ metadata_private: { ...(data.metadata_private || {}), requires_manual_allocation: true } })
          .eq('id', data.id);

        await sendEmail({
          to: process.env.ADMIN_EMAIL || 'jimkalinov@gmail.com',
          subject: `[Businto] New ${service_type} Request #${data.id.slice(0, 8)} — Awaiting Manual Dispatch`,
          html: `
            <h2>New Request — Manual Dispatch Required</h2>
            <p>A new transport request came in. Auto-matching is disabled. Please dispatch manually from the admin panel.</p>
            <ul>
              <li><strong>Request ID:</strong> ${data.id}</li>
              <li><strong>Service:</strong> ${service_type}</li>
              <li><strong>Pickup:</strong> ${pickup_fuzzy || pickup_address}</li>
              <li><strong>Dropoff:</strong> ${dropoff_fuzzy || dropoff_address}</li>
              <li><strong>Date:</strong> ${start_date}${start_time ? ' at ' + start_time : ''}</li>
            </ul>
            <p><a href="${appBaseUrl}/master/admin">Open Admin Panel</a></p>
          `,
        });

        await logEvent({
          event_type: 'request.manual_dispatch.pending',
          actor_type: 'system',
          request_id: data.id,
          metadata: { service_type, pickup: pickup_fuzzy || pickup_address },
        });
      } else {

        mark('operator-matching-start');
        const operators = await findMatchingOperators({
          service_type,
          pickup_address,
          pickup_fuzzy,
          dropoff_address,
          dropoff_fuzzy,
          metadata
        });
        mark('operator-matching-end');
        perfTrace.operator_matching_ms = measure('operator-matching', 'operator-matching-start', 'operator-matching-end');

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
              to: process.env.ADMIN_EMAIL || 'jimkalinov@gmail.com',
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
              metadata: { service_type, pickup: pickup_fuzzy }
            });
          } catch (err) {
            console.error('Failed to handle unmatched request fallback:', err);
            await logEvent({
              event_type: 'request.manual_allocation.failed',
              status: 'error',
              actor_type: 'system',
              request_id: data.id,
              message: err instanceof Error ? err.message : 'Unknown fallback error'
            });
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
        console.log(`🔔 Notifying ${operatorsToNotify.length} unique Affiliate operators initially`);
        console.log('🔔 ==========================================\n');

        const serviceTypeMap: Record<string, string> = {
          school: 'School Transportation',
          medical: 'Medical Transportation',
          wedding: 'Event Shuttle',
          corporate: 'Corporate Travel'
        };

        const serviceTypeDisplay = serviceTypeMap[service_type] || service_type;

        // Send email to each matching operator
        mark('operator-loop-start');
        for (const operator of operatorsToNotify) {
          const opStart = Date.now();
          try {
            // Generate tracking-resistant claim link (survives email provider click tracking)
            const claimLink = await generateOperatorQuoteLink(
              data.id,
              operator.id,
              operator.company_email
            );

            console.log(`[API/Requests] Generated claimLink for operator ${operator.id}`);

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
                claimLink, // Short tracking-resistant link
                appBaseUrl
              }),
              // CRITICAL: Force SMTP relay (not REST API) to ensure X-Mailin-Track-Click header is respected
              // Brevo's click tracking corrupts the link; SMTP relay respects this header better than API
              trackingClicks: false,
              forceSmtp: true,
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

            // Create in-app notification for operator (only if they have a linked profile)
            if (operator.profile_id) {
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
            } else {
              console.log(`ℹ️ Skipping in-app notification for operator ${operator.id} (no profile_id)`);
            }

            if (IS_DEV_PERF) console.log(`  [perf] operator ${operator.company_name} email+notification: ${Date.now() - opStart}ms`);
            if (IS_DEV_PERF) console.log(`✓ Notified operator ${operator.id} via email (Partner: ${operator.is_partner})`);

            // SMS Notification (Fire and forget)
            if (operator.company_phone) {
              try {
                const operatorPhone = operator.company_phone;
                await sendSMS({
                  to: operatorPhone,
                  ...smsTemplates.newRequestAlert({
                    serviceType: service_type,
                    location: pickup_fuzzy || pickup_address.split(',')[0],
                    requestId: data.id,
                    claimLink: claimLink
                  })
                });
                if (IS_DEV_PERF) console.log(`✓ Notified operator via SMS: ${operator.company_name}`);
              } catch (smsErr) {
                console.error('Failed to send SMS to operator:', operator.id, smsErr);
              }
            }
          } catch (err) {
            console.error('Failed to notify operator:', operator.id, err);
          }
        }

        mark('operator-loop-end');
        perfTrace.operator_loop_ms = measure('operator-loop', 'operator-loop-start', 'operator-loop-end');
        console.log(`Operator notification complete for request ${data.id}`);
      } // end else (auto dispatch)
    } catch (matchErr) {
      console.error('Failed to match/notify operators:', matchErr);
    }

    if (IS_DEV_PERF) {
      mark('req-end');
      const total = measure('req-total', reqStart, 'req-end');
      console.log('[PERF TRACE] POST /api/requests', {
        ...perfTrace,
        total_ms: total,
        note: 'excludes: confirmation email (awaited), Stripe checkout URL'
      });
    }

    let paymentUrl: string | undefined;

    // Generate checkout URL if payment is pending AND we matched at least one operator
    if (payment_status === 'pending' && matchedOperatorsCount > 0) {
      try {
        const appUrl = getAppBaseUrl();
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
        await logEvent({
          event_type: 'request.stripe_session.failed',
          status: 'error',
          actor_type: 'system',
          request_id: data.id,
          message: stripeErr instanceof Error ? stripeErr.message : 'Stripe API error'
        });
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
          operator:operators (
            id,
            company_name,
            company_email,
            company_phone,
            profile:operator_profiles!profile_id (
              full_name,
              avatar_url
            )
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
