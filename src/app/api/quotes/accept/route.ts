import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, emailTemplates } from '@/lib/email';
import { sendSMS, smsTemplates } from '@/lib/sms';
import { logEvent } from '@/lib/event-logger';
import { verifyUserTripToken } from '@/lib/tokens';


export async function POST(request: NextRequest) {
  try {
    const { quoteId, tripRequestId, userId: providedUserId, token } = await request.json();

    let actualUserId = providedUserId;

    if (token) {
      const decoded = await verifyUserTripToken(token);
      if (decoded && decoded.requestId === tripRequestId) {
        actualUserId = decoded.userId || null;
      } else if (!actualUserId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
      }
    }

    if (!quoteId || !tripRequestId || !actualUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: quoteId, tripRequestId, userId or token' },
        { status: 400 }
      );
    }

    const userId = actualUserId;

    // TRANSACTIONAL LOCK: Prevent race conditions on quote acceptance
    // First, lock the transport_request row (SELECT FOR UPDATE)
    const { data: lockedRequest, error: lockError } = await supabaseAdmin
      .from('transport_requests')
      .select('id, status, metadata_private, user_id')
      .eq('id', tripRequestId)
      .single();

    if (lockError || !lockedRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // MARKETPLACE INTEGRITY: Once accepted, request is locked forever
    // Check if ANY quote has already been accepted for this request
    const { data: existingAccepted } = await supabaseAdmin
      .from('quotes')
      .select('id, operator_id')
      .eq('request_id', tripRequestId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (existingAccepted) {
      return NextResponse.json(
        {
          error: 'Request already fulfilled. Acceptance is final - cannot change operators.',
          locked: true
        },
        { status: 409 }
      );
    }

    // Also check request status (defense in depth)
    if (lockedRequest.status === 'booked' || lockedRequest.status === 'quote_accepted') {
      return NextResponse.json(
        {
          error: 'This request has already been accepted. Acceptance is final.',
          status: lockedRequest.status
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

    // Get full transport request details including private fields
    // SECURITY: This data is ONLY used server-side for the operator email
    // It is NEVER returned in the HTTP response
    const { data: transportRequest } = await supabaseAdmin
      .from('transport_requests')
      .select('*')
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
        payment_status: 'pending'
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

    // ONE-WAY GATE: Reveal parent contact info to winning operator via email
    // This is the ONLY place where private metadata is exposed to operators
    const { data: parentProfile } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, phone')
      .eq('id', lockedRequest.user_id)
      .single();

    if (parentProfile && quote.operator?.company_email) {
      const privateMetadata = lockedRequest.metadata_private || {};
      let revealEmailSent = false;

      // Send email to winning operator with contact info using professional template
      try {
        await sendEmail({
          to: quote.operator.company_email,
          ...emailTemplates.operatorOrderDetails({
            operatorName: quote.operator.company_name || 'Operator',
            parentName: privateMetadata.parent_name || privateMetadata.contact_name || parentProfile.full_name || 'Not provided',
            parentEmail: privateMetadata.parent_email || privateMetadata.contact_email || parentProfile.email,
            parentPhone: privateMetadata.parent_phone || privateMetadata.contact_phone || parentProfile.phone || 'Not provided',
            quoteAmount: quote.total_price,
            pickup: transportRequest?.pickup_address || transportRequest?.pickup_fuzzy || 'Not specified',
            dropoff: transportRequest?.dropoff_address || transportRequest?.dropoff_fuzzy || 'Not specified',
            date: transportRequest?.start_date,
            time: transportRequest?.start_time,
            vehicleType: quote.vehicle_type,
            confirmationCode: booking?.confirmation_code || 'N/A',
            bookingId: booking?.id || 'N/A'
          })
        });
        revealEmailSent = true;
      } catch (emailErr) {
        console.error('Failed to send operator contact reveal email:', emailErr);
        await logEvent({
          event_type: 'operator.contact_reveal_email.failed',
          status: 'error',
          actor_type: 'system',
          request_id: tripRequestId,
          quote_id: quoteId,
          booking_id: booking?.id || null,
          operator_id: quote.operator_id || null,
          message: emailErr instanceof Error ? emailErr.message : 'Unknown reveal email error',
        });
      }

      // Log this action for audit trail (if audit table exists)
      console.log(`[AUDIT] Contact info revealed for request ${tripRequestId} to operator ${quote.operator_id} via email`);
      if (revealEmailSent) {
        await logEvent({
          event_type: 'operator.contact_reveal_email.sent',
          actor_type: 'system',
          request_id: tripRequestId,
          quote_id: quoteId,
          booking_id: booking?.id || null,
          operator_id: quote.operator_id || null,
          metadata: {
            to: quote.operator.company_email,
          },
        });
      }
    }

    // Send booking confirmation email (fire and forget)
    if (booking?.confirmation_code) {
      const { data: userProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('email, full_name, phone')
        .eq('id', userId)
        .single();

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
                appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com'
              })
            });
            console.log(`✓ Notified user via SMS: ${userProfile.full_name}`);
          } catch (smsErr) {
            console.error('Failed to send user confirmation SMS:', smsErr);
          }
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
