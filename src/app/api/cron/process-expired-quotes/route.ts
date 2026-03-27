import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

export const dynamic = 'force-dynamic';

// Quotes older than 7 days without acceptance are auto-expired
const EXPIRY_DAYS = 7;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.VERCEL_CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Atomic: update+select in one query — only touches rows still pending
    const { data: staleQuotes, error: updateErr } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lte('created_at', cutoff)
      .select('id, request_id, operator_id');

    if (updateErr) {
      console.error('[process-expired-quotes] Update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!staleQuotes || staleQuotes.length === 0) {
      return NextResponse.json({ success: true, expired: 0 });
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

    console.log(`[process-expired-quotes] Expired ${staleQuotes.length} stale quotes`);
    return NextResponse.json({ success: true, expired: staleQuotes.length });
  } catch (err) {
    console.error('[process-expired-quotes] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
