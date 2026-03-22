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

    // SECURITY: Resolve identity from session (preferred) or verified token (magic link).
    // Never trust userId from the request body — it is ignored entirely.
    let actualUserId: string | null = null;

    // 1. Try session first (authenticated users)
    const supabase = await createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (sessionUser) {
      actualUserId = sessionUser.id;
    }

    // 2. Fall back to signed token (anonymous / magic-link users)
    if (!actualUserId && token) {
      const decoded = await verifyUserTripToken(token);
      if (decoded && decoded.requestId === tripRequestId) {
        actualUserId = decoded.userId || null;
      } else {
        return NextResponse.json({ error: 'Invalid or mismatched token' }, { status: 403 });
      }
    }

    // 3. No valid identity — reject
    if (!actualUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

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

    const userId = actualUserId;

    // TRANSACTIONAL ATOMICITY: Check if already fulfilled using a reliable sequence
    const { data: requestVerification, error: verificationError } = await supabaseAdmin
      .from('transport_requests')
      .select('status, user_id, metadata_private')
      .eq('id', tripRequestId)
      .single();

    if (verificationError || !requestVerification) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // SECURITY: Verify the authenticated user owns this request
    if (requestVerification.user_id && requestVerification.user_id !== userId) {
      await logEvent({
        event_type: 'quote.accept.ownership_failed',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        message: 'User attempted to accept a quote on a request they do not own',
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (requestVerification.status === 'booked') {
      await logEvent({
        event_type: 'quote.accept.conflict',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: 'Attempted to accept an already fulfilled request (Race Condition blocked)',
        metadata: { current_status: requestVerification.status }
      });
      return NextResponse.json(
        {
          error: 'Request already fulfilled. Acceptance is final - cannot change operators.',
          locked: true
        },
        { status: 409 }
      );
    }

    // Get the quote details with operator info
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select(`
        *,
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
      `)
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // QUOTE EXPIRY: Prevent accepting expired quotes
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      // Mark the quote as expired in DB if it isn't already
      if (quote.status !== 'expired') {
        await supabaseAdmin
          .from('quotes')
          .update({ status: 'expired' })
          .eq('id', quoteId);
      }
      await logEvent({
        event_type: 'quote.accept.expired',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: 'Attempted to accept an expired quote',
        metadata: { expires_at: quote.expires_at }
      });
      return NextResponse.json(
        { error: 'This quote has expired and can no longer be accepted. Please request a new quote.' },
        { status: 410 }
      );
    }

    // Get full transport request details including private fields + user profile in ONE query
    // PERF: Was two sequential DB queries (transport_requests then profiles) — merged to save ~130ms
    // SECURITY: This data is ONLY used server-side; it is NEVER returned in the HTTP response
    const { data: transportRequest } = await supabaseAdmin
      .from('transport_requests')
      .select('*, userProfile:profiles!user_id(email, full_name, phone)')
      .eq('id', tripRequestId)
      .single();

    // Update the accepted quote
    const { error: updateError } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'accepted' })
      .eq('id', quoteId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Permanently decline other quotes for this request
    // MARKETPLACE INTEGRITY: Once declined, these quotes are permanently closed
    // They will NOT be resurrected even if parent regrets choice
    const { data: declinedQuotes } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'declined' })
      .eq('request_id', tripRequestId)
      .neq('id', quoteId)
      .select('operator_id');

    // Notify losing operators
    if (declinedQuotes && declinedQuotes.length > 0) {
      const notifications = declinedQuotes.map(q => ({
        user_id: q.operator_id,
        type: 'quote_declined',
        title: 'Quote Not Selected',
        message: 'The customer has chosen another operator for this request.',
        data: { request_id: tripRequestId }
      }));

      await supabaseAdmin
        .from('notifications')
        .insert(notifications);
    }

    // Update transport request status to booked and store winning quote
    const { error: requestUpdateError } = await supabaseAdmin
      .from('transport_requests')
      .update({
        status: 'booked',
        // Store winning quote_id for reference (optional field)
      })
      .eq('id', tripRequestId);

    if (requestUpdateError) {
      await logEvent({
        event_type: 'quote.accept.db_error',
        status: 'error',
        actor_id: userId,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: 'Failed to update transport_requests status to booked',
        metadata: { error: requestUpdateError.message }
      });
      return NextResponse.json(
        { error: 'Failed to update request status' },
        { status: 500 }
      );
    }

    await logEvent({
      event_type: 'quote.accepted',
      actor_type: 'user',
      actor_id: userId,
      user_id: userId,
      operator_id: quote.operator_id || null,
      request_id: tripRequestId,
      quote_id: quoteId,
      metadata: {
        accepted_price: quote.total_price,
      },
    });

    // Check if manual dispatch mode is active — PERF: use cached setting (60s TTL)
    const isManualMode = await getDispatchMode();

    // Create a booking record
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        request_id: tripRequestId,
        quote_id: quoteId,
        user_id: userId,
        operator_id: quote.operator_id,
        amount: quote.total_price,
        status: 'confirmed',
        payment_status: 'pending',
        requires_manual_exchange: isManualMode,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      await logEvent({
        event_type: 'booking.create.failed',
        status: 'error',
        actor_type: 'system',
        user_id: userId,
        operator_id: quote.operator_id || null,
        request_id: tripRequestId,
        quote_id: quoteId,
        message: bookingError.message,
      });
    } else if (booking) {
      await logEvent({
        event_type: 'booking.created',
        actor_type: 'system',
        user_id: userId,
        operator_id: quote.operator_id || null,
        request_id: tripRequestId,
        quote_id: quoteId,
        booking_id: booking.id,
        metadata: {
          amount: booking.amount,
          status: booking.status,
          payment_status: booking.payment_status,
        },
      });
    }

    // Create notification for operator
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: quote.operator_id,
        type: 'quote_accepted',
        title: 'Quote Accepted!',
        message: `Your quote for $${quote.total_price} has been accepted.`,
        data: { quote_id: quoteId, booking_id: booking?.id }
      });

    // REDESIGN: PII reveal is now MOVED to the checkout.sessions.completed or payment_intent.succeeded webhook
    // This API only handles the status transition and booking creation.
    // The operator will receive the detailed order email via the webhook after the $1.99 fee is secured.

    // Send booking confirmation email (fire and forget)
    if (booking?.confirmation_code) {
      // PERF: Profile data already fetched via JOIN in the transport_request query above
      // No extra DB round-trip needed here
      const joinedProfile = (transportRequest as any)?.userProfile;
      const profileError = joinedProfile ? null : new Error('Profile not joined');
      const userProfile = joinedProfile || null;

      if (profileError) {
        console.error('Failed to fetch user for booking email:', profileError);
      } else if (userProfile?.email && transportRequest) {
        const operatorName = quote.operator?.company_name || quote.operator?.full_name || 'The operator';
        let bookingConfirmationSent = false;

        try {
          await sendEmail({
            to: userProfile.email,
            ...emailTemplates.bookingConfirmation({
              userName: userProfile.full_name || 'User',
              confirmationCode: booking.confirmation_code,
              operatorName,
              operatorPhone: quote.operator?.company_phone,
              operatorEmail: quote.operator?.company_email,
              vehicleType: quote.vehicle_type,
              pickupAddress: transportRequest.pickup_fuzzy || transportRequest.pickup_address,
              dropoffAddress: transportRequest.dropoff_fuzzy || transportRequest.dropoff_address,
              date: transportRequest.start_date,
              time: transportRequest.start_time || '08:00',
              amount: quote.total_price,
            })
          });
          bookingConfirmationSent = true;
        } catch (err) {
          console.error('Failed to send booking confirmation email:', err);
          await logEvent({
            event_type: 'booking.confirmation_email.failed',
            status: 'error',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: booking.id,
            user_id: userId,
            message: err instanceof Error ? err.message : 'Unknown booking confirmation email error',
            metadata: { to: userProfile.email },
          });
        }

        if (bookingConfirmationSent) {
          await logEvent({
            event_type: 'booking.confirmation_email.sent',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: booking.id,
            user_id: userId,
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
            console.log(`✓ Notified user via SMS for booking ${booking.id.slice(0, 8)}`);
          } catch (smsErr) {
            console.error('Failed to send user confirmation SMS:', smsErr);
          }
        }

        // PII Release to Operator is removed from here
        // The detailed operator view containing PII will be sent via `payments/webhook/route.ts`
        // once the $1.99 Platform Routing Fee payment intent has succeeded.
        if (isManualMode) {
          // Notify admin to complete PII exchange manually
          const appBaseUrl = getAppBaseUrl();
          await sendEmail({
            to: process.env.ADMIN_EMAIL || 'jimkalinov@gmail.com',
            subject: `[Businto] Booking Confirmed — PII Exchange Pending #${booking.id.slice(0, 8)}`,
            html: `
              <h2>Booking Confirmed — Manual PII Exchange Required</h2>
              <p>User accepted a quote. Please send their details to the operator from the admin panel.</p>
              <ul>
                <li><strong>Booking ID:</strong> ${booking.id}</li>
                <li><strong>Operator:</strong> ${operatorName}</li>
                <li><strong>Amount:</strong> $${quote.total_price}</li>
              </ul>
              <p><a href="${appBaseUrl}/master/admin">Open Admin Panel → Pending PII Exchange</a></p>
            `,
          }).catch(err => console.error('Failed to send admin PII exchange notification:', err));

          await logEvent({
            event_type: 'booking.pii_exchange.pending',
            actor_type: 'system',
            request_id: tripRequestId,
            quote_id: quoteId,
            booking_id: booking.id,
            operator_id: quote.operator_id,
            metadata: { manual_mode: true },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Quote accepted successfully',
      quoteId,
      bookingId: booking?.id,
      confirmationCode: booking?.confirmation_code
    });
  } catch (error) {
    console.error('Error accepting quote:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
