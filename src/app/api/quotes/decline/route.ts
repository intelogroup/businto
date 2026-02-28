import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { quoteId } = await request.json();

    if (!quoteId) {
      return NextResponse.json(
        { error: 'Missing quoteId' },
        { status: 400 }
      );
    }

    // Get quote to find operator for notification
    const { data: quote } = await supabase
      .from('quotes')
      .select('operator_id, total_price')
      .eq('id', quoteId)
      .single();

    // Update quote status
    const { error } = await supabase
      .from('quotes')
      .update({ status: 'declined' })
      .eq('id', quoteId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify operator
    if (quote) {
      await supabase
        .from('notifications')
        .insert({
          user_id: quote.operator_id,
          type: 'quote_declined',
          title: 'Quote Declined',
          message: `Your quote for $${quote.total_price} was declined.`,
          data: { quote_id: quoteId }
        });
    }

    return NextResponse.json({
      success: true,
      message: 'Quote declined successfully',
      quoteId,
    });
  } catch (error) {
    console.error('Error declining quote:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
