import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';

/**
 * Refund Policy:
 * - Automatic refund if no operator accepts quote within 48 hours
 * - Manual refund if all quotes are declined/expired
 * - Check quote status (must be pending or accepted) - if withdrawn/declined, no refund
 * - Idempotent: uses booking_id as idempotency key
 */

export async function POST(request: NextRequest) {
  try {
    const { bookingId, reason = 'No operator response' } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Missing bookingId' },
        { status: 400 }
      );
    }

    // Get booking with quotes
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        quotes (
          id,
          status,
          created_at
        )
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if already refunded
    if (booking.payment_status === 'refunded') {
      return NextResponse.json({
        success: true,
        message: 'Booking already refunded',
        alreadyRefunded: true
      });
    }

    // Check if payment was made
    if (!booking.stripe_payment_intent_id || booking.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'No payment to refund' },
        { status: 400 }
      );
    }

    // Validate refund eligibility based on quote status
    const hasValidQuotes = booking.quotes?.some((q: any) => 
      q.status === 'pending' || q.status === 'accepted'
    );

    if (!hasValidQuotes) {
      return NextResponse.json(
        { error: 'Refund not eligible: All quotes were withdrawn or declined' },
        { status: 400 }
      );
    }

    // Check 48-hour rule for automatic refunds
    const bookingCreatedAt = new Date(booking.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - bookingCreatedAt.getTime()) / (1000 * 60 * 60);

    if (reason === 'No operator response' && hoursSinceCreation < 48) {
      return NextResponse.json(
        { error: 'Cannot auto-refund before 48 hours' },
        { status: 400 }
      );
    }

    // Process refund with idempotency
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: {
        booking_id: bookingId,
        refund_reason: reason
      }
    }, {
      idempotencyKey: `refund-${bookingId}`
    });

    // Update booking status
    await supabase
      .from('bookings')
      .update({ 
        payment_status: 'refunded',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    // Create notification for user
    const { data: userData } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', booking.user_id)
      .single();

    if (userData) {
      await supabase
        .from('notifications')
        .insert({
          user_id: userData.id,
          title: 'Refund Processed',
          message: `Your routing fee of $${booking.routing_fee_amount || 1.99} has been refunded. ${reason}`,
          type: 'payment',
          read: false
        });
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    });

  } catch (error: any) {
    console.error('Error processing refund:', error);
    
    // Handle duplicate refund attempts
    if (error.type === 'StripeInvalidRequestError' && error.message?.includes('already been refunded')) {
      return NextResponse.json({
        success: true,
        message: 'Payment already refunded',
        alreadyRefunded: true
      });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    );
  }
}
