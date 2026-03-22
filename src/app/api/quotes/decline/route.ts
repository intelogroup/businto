import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication — only the request owner may decline a quote.
    const supabaseUser = await createClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quoteId } = await request.json();

    if (!quoteId) {
      return NextResponse.json(
        { error: 'Missing quoteId' },
        { status: 400 }
      );
    }

    // Get quote with its associated request to verify ownership
    const { data: quote } = await supabase
      .from('quotes')
      .select('operator_id, total_price, request_id')
      .eq('id', quoteId)
      .single();

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // SECURITY: Verify the authenticated user owns the transport request this quote belongs to
    const { data: transportRequest } = await supabase
      .from('transport_requests')
      .select('user_id')
      .eq('id', quote.request_id)
      .single();

    if (!transportRequest || transportRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
