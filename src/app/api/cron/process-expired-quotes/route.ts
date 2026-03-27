import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

export const dynamic = 'force-dynamic';

// Quotes older than 7 days without acceptance are auto-expired
const EXPIRY_DAYS = 7;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Find pending quotes older than EXPIRY_DAYS
    const { data: staleQuotes, error: fetchErr } = await supabaseAdmin
      .from('quotes')
      .select('id, request_id, operator_id')
      .eq('status', 'pending')
      .lte('created_at', cutoff);

    if (fetchErr) {
      console.error('[process-expired-quotes] Fetch error:', fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!staleQuotes || staleQuotes.length === 0) {
      return NextResponse.json({ success: true, expired: 0 });
    }

    // Batch update all stale quotes to 'expired'
    const quoteIds = staleQuotes.map(q => q.id);
    const { error: updateErr } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'expired' })
      .in('id', quoteIds);

    if (updateErr) {
      console.error('[process-expired-quotes] Update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log each expiry event
    for (const quote of staleQuotes) {
      await logEvent({
        event_type: 'quote.expired',
        actor_type: 'system',
        quote_id: quote.id,
        request_id: quote.request_id,
        operator_id: quote.operator_id,
        metadata: { expiry_days: EXPIRY_DAYS },
      });
    }

    console.log(`[process-expired-quotes] Expired ${quoteIds.length} stale quotes`);
    return NextResponse.json({ success: true, expired: quoteIds.length });
  } catch (err) {
    console.error('[process-expired-quotes] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
