import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, emailTemplates, getAppBaseUrl } from '@/lib/email';
import { sendSMS, smsTemplates } from '@/lib/sms';
import { logEvent } from '@/lib/event-logger';
import { verifyUserTripToken } from '@/lib/tokens';
import { getDispatchMode } from '@/lib/app-settings';


export async function POST(request: NextRequest) {
  try {
    const { quoteId, tripRequestId, token } = await request.json();

    if (!quoteId || !tripRequestId) {
      await logEvent({
        event_type: 'quote.accept.validation_failed',
        status: 'error',
        message: 'Missing required fields',
        metadata: { quoteId, tripRequestId }
      });
      return NextResponse.json(
        { error: 'Missing required fields: quoteId, tripRequestId' },
        { status: 400 }
      );
    }

    // SECURITY: Look up who actually owns this request BEFORE trusting any identity
    // source. Guest/anonymous requests have user_id = NULL — for those, a bare
    // session proves nothing (anyone logged in could otherwise hijack the booking),
    // so only a signed token scoped to this exact request counts as proof. For
    // owned requests, the session must belong to the actual owner.
    const { data: requestOwner, error: requestOwnerError } = await supabaseAdmin
      .from('transport_requests')
      .select('user_id')
      .eq('id', tripRequestId)
      .maybeSingle();

    if (requestOwnerError || !requestOwner) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Never trust userId from the request body — it is ignored entirely.
    let actualUserId: string | null = null;

    const supabase = await createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();

    if (requestOwner.user_id) {
      // Owned request: the session must belong to the actual owner.
      if (sessionUser && sessionUser.id === requestOwner.user_id) {
        // M10: Require verified email before accepting quotes.
        // Unverified users can't receive booking confirmations or PII exchange emails.
        if (!sessionUser.email_confirmed_at) {
          return NextResponse.json(
            { error: 'Please verify your email address before accepting a quote.' },
            { status: 403 }
          );
        }
        actualUserId = sessionUser.id;
      } else if (token) {
        const decoded = await verifyUserTripToken(token);
        if (decoded && decoded.requestId === tripRequestId && decoded.userId === requestOwner.user_id) {
          actualUserId = decoded.userId ?? null;
        } else {
          return NextResponse.json({ error: 'Invalid or mismatched token' }, { status: 403 });
        }
      }
    } else if (token) {
      // Guest request: no owner to match a session against — the signed,
      // request-scoped token is the only valid proof of identity.
      const decoded = await verifyUserTripToken(token);
      if (decoded && decoded.requestId === tripRequestId) {
        actualUserId = decoded.userId || null;
      } else {
        return NextResponse.json({ error: 'Invalid or mismatched token' }, { status: 403 });
      }
    }

    if (!actualUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = actualUserId;

    // Check if manual dispatch mode is active — PERF: use cached setting (60s TTL)
    const isManualMode = await getDispatchMode();

    // ATOMIC ACCEPTANCE: Use Postgres RPC to accept quote, decline others,
    // update request status, and create booking in a single transaction.
    // This prevents race conditions where two users accept different quotes simultaneously.
    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('accept_quote_atomic', {
        p_quote_id: quoteId,
        p_request_id: tripRequestId,
        p_user_id: userId,
        p_is_manual_mode: isManualMode,
      });

    if (rpcError) {
      console.error('RPC accept_quote_atomic error:', rpcError);
      await logEvent({
        event_type: 'quote.accept.rpc_error',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: rpcError.message,
      });
      return NextResponse.json({ error: 'Failed to accept quote' }, { status: 500 });
    }

    // RPC returns a JSONB object with success/error fields
    if (!result?.success) {
      const statusCode = result?.code || 500;
      const errorMsg = result?.error || 'Unknown error';

      await logEvent({
        event_type: statusCode === 409 ? 'quote.accept.conflict' : 'quote.accept.failed',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: errorMsg,
        metadata: { rpc_result: result }
      });

      return NextResponse.json(
        { error: errorMsg, locked: result?.locked || false },
        { status: statusCode }
      );
    }

    // Extract results from atomic operation
    const bookingId = result.booking_id;
    const confirmationCode = result.confirmation_code;
    const operatorId = result.operator_id;
    const totalPrice = result.total_price;
    const declinedOperatorIds: string[] = result.declined_operator_ids || [];

    await logEvent({
      event_type: 'quote.accepted',
      actor_type: 'user',
      actor_id: userId,
      user_id: userId,
      operator_id: operatorId || null,
      request_id: tripRequestId,
      quote_id: quoteId,
      booking_id: bookingId,
      metadata: {
        accepted_price: totalPrice,
        confirmation_code: confirmationCode,
      },
    });

    // ── Post-transaction side effects (notifications, emails) ──
    // These happen AFTER the atomic transaction succeeds. If they fail,
    // the booking is still valid — they are fire-and-forget.

    // Notify losing operators
    if (declinedOperatorIds.length > 0) {
      const notifications = declinedOperatorIds
        .filter((id): id is string => id != null)
        .map(opId => ({
          user_id: opId,
          type: 'quote_declined',
          title: 'Quote Not Selected',
          message: 'The customer has chosen another operator for this request.',
          data: { request_id: tripRequestId }
        }));

      if (notifications.length > 0) {
        const { error: declinedErr } = await supabaseAdmin
          .from('notifications')
          .insert(notifications);
        if (declinedErr) console.error('Failed to notify declined operators:', declinedErr);
      }
    }

    // Notify winning operator
    const { error: winnerErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: operatorId,
        type: 'quote_accepted',
        title: 'Quote Accepted!',
        message: `Your quote for $${totalPrice} has been accepted.`,
        data: { quote_id: quoteId, booking_id: bookingId }
      });
    if (winnerErr) console.error('Failed to notify winning operator:', winnerErr);

    // REDESIGN: PII reveal is MOVED to the checkout.sessions.completed or payment_intent.succeeded webhook.
    // This API only handles the status transition and booking creation.

    // Send booking confirmation email (fire and forget)
    try {
      // Fetch data needed for email (separate from the atomic transaction)
      const { data: transportRequest } = await supabaseAdmin
        .from('transport_requests')
        .select('*, userProfile:profiles!user_id(email, full_name, phone)')
        .eq('id', tripRequestId)
        .single();

      const { data: quote } = await supabaseAdmin
        .from('quotes')
        .select(`
          *,
          operator:operators (
            id, company_name, company_email, company_phone,
            profile:operator_profiles!profile_id (full_name, avatar_url)
          )
        `)
        .eq('id', quoteId)
        .single();

      const joinedProfile = (transportRequest as any)?.userProfile;
      const userProfile = joinedProfile || null;

      if (userProfile?.email && transportRequest && quote) {
        const operatorName = quote.operator?.company_name || 'The operator';

        try {
          await sendEmail({
            to: userProfile.email,
            ...emailTemplates.bookingConfirmation({
              userName: userProfile.full_name || 'User',
              confirmationCode,
              operatorName,
              vehicleType: quote.vehicle_type,
              pickupAddress: transportRequest.pickup_fuzzy || transportRequest.pickup_address,
              dropoffAddress: transportRequest.dropoff_fuzzy || transportRequest.dropoff_address,
              date: transportRequest.start_date,
              time: transportRequest.start_time || '08:00',
              amount: totalPrice,
            })
          });

          await logEvent({
            event_type: 'booking.confirmation_email.sent',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: bookingId,
            user_id: userId,
            metadata: { to: userProfile.email },
          });
        } catch (err) {
          console.error('Failed to send booking confirmation email:', err);
          await logEvent({
            event_type: 'booking.confirmation_email.failed',
            status: 'error',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: bookingId,
            user_id: userId,
            message: err instanceof Error ? err.message : 'Unknown booking confirmation email error',
            metadata: { to: userProfile.email },
          });
        }

        // SMS Notification to User (Fire and forget)
        if (userProfile?.phone) {
          try {
            await sendSMS({
              to: userProfile.phone,
              ...smsTemplates.quoteAccepted({
                operatorName,
                requestId: tripRequestId,
                appUrl: getAppBaseUrl()
              })
            });
          } catch (smsErr) {
            console.error('Failed to send user confirmation SMS:', smsErr);
          }
        }

        // Manual mode: Notify admin for PII exchange
        if (isManualMode) {
          const appBaseUrl = getAppBaseUrl();
          await sendEmail({
            to: process.env.ADMIN_EMAIL || 'jimkalinov@gmail.com',
            subject: `[Businto] Booking Confirmed — PII Exchange Pending #${bookingId.slice(0, 8)}`,
            html: `
              <h2>Booking Confirmed — Manual PII Exchange Required</h2>
              <p>User accepted a quote. Please send their details to the operator from the admin panel.</p>
              <ul>
                <li><strong>Booking ID:</strong> ${bookingId}</li>
                <li><strong>Operator:</strong> ${operatorName}</li>
                <li><strong>Amount:</strong> $${totalPrice}</li>
              </ul>
              <p><a href="${appBaseUrl}/master/admin">Open Admin Panel → Pending PII Exchange</a></p>
            `,
          }).catch(err => console.error('Failed to send admin PII exchange notification:', err));

          await logEvent({
            event_type: 'booking.pii_exchange.pending',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: bookingId,
            operator_id: operatorId,
            metadata: { manual_mode: true },
          });
        }
      }
    } catch (emailError) {
      // Email/notification failures should not fail the acceptance
      console.error('Post-acceptance notification error:', emailError);
    }

    return NextResponse.json({
      success: true,
      message: 'Quote accepted successfully',
      quoteId,
      bookingId,
      confirmationCode,
    });
  } catch (error) {
    console.error('Error accepting quote:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
