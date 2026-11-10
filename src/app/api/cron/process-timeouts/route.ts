import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/event-logger';
import { mergeMetadata } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

// Flag requests as needing re-dispatch if operator was notified > 4 hours ago with no quote
const TIMEOUT_HOURS = 4;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.VERCEL_CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

    // Find operator dispatch codes older than TIMEOUT_HOURS that haven't expired
    const { data: staleCodes, error: codesErr } = await supabaseAdmin
      .from('email_claim_codes')
      .select('resource_id, operator_id')
      .eq('purpose', 'quote')
      .lte('created_at', cutoff)
      .gt('expires_at', new Date().toISOString());

    if (codesErr) {
      console.error('[process-timeouts] Failed to fetch claim codes:', codesErr);
      return NextResponse.json({ error: codesErr.message }, { status: 500 });
    }

    if (!staleCodes || staleCodes.length === 0) {
      return NextResponse.json({ success: true, flagged: 0 });
    }

    let flagged = 0;

    for (const code of staleCodes) {
      const requestId = code.resource_id;
      const operatorId = code.operator_id;

      // Check if a quote was already submitted for this request+operator
      const { data: existingQuote } = await supabaseAdmin
        .from('quotes')
        .select('id')
        .eq('request_id', requestId)
        .eq('operator_id', operatorId)
        .not('status', 'eq', 'declined')
        .maybeSingle();

      if (existingQuote) continue; // Operator responded, skip

      // Fetch request — only process active ones not yet flagged for timeout
      const { data: request } = await supabaseAdmin
        .from('transport_requests')
        .select('status, metadata_private')
        .eq('id', requestId)
        .in('status', ['pending', 'quoted'])
        .maybeSingle();

      if (!request) continue; // Already booked, cancelled, or not found

      // Skip if already flagged for timeout
      if (request.metadata_private?.timeout_alerted_at) continue;

      // METADATA MERGE (BUS-CRON-TIMEOUT-CLOBBER-001): never write back
      // the snapshot read above. mergeMetadata claims the request with
      // a predicated touch, re-reads it, and merges the flag keys into
      // the FRESH metadata object through a write predicated on the
      // fresh state — a booking landing inside the old read→write
      // window refuses the flag, and a metadata key written
      // concurrently (e.g. a priority-payment marker) survives.
      const merged = await mergeMetadata(supabaseAdmin, {
        table: 'transport_requests',
        id: requestId,
        from: ['pending', 'quoted'],
        additions: {
          requires_manual_allocation: true,
          timeout_alerted_at: new Date().toISOString(),
        },
        isEligible: (fresh) => !fresh.metadata_private?.timeout_alerted_at,
      });

      if (!merged.ok) {
        if (merged.kind === 'error') {
          console.error(`[process-timeouts] Failed to flag request ${requestId}:`, merged.error);
        }
        continue;
      }

      await logEvent({
        event_type: 'operator.quote_timeout',
        actor_type: 'system',
        operator_id: operatorId,
        request_id: requestId,
        metadata: { timeout_hours: TIMEOUT_HOURS },
      });

      flagged++;
    }

    console.log(`[process-timeouts] Flagged ${flagged} timed-out requests`);
    return NextResponse.json({ success: true, flagged });
  } catch (err) {
    console.error('[process-timeouts] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
