import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

export const dynamic = 'force-dynamic';

// Flag requests as needing re-dispatch if operator was notified > 4 hours ago with no quote
const TIMEOUT_HOURS = 4;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    // Vercel Cron only auto-injects the bearer token for a var literally named
    // CRON_SECRET; VERCEL_CRON_SECRET is kept as a fallback in case that's what's
    // actually configured in the live project.
    const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
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

      // Read-modify-write: flag for Safety Valve + record when we flagged it
      const { error: updateErr } = await supabaseAdmin
        .from('transport_requests')
        .update({
          metadata_private: {
            ...request.metadata_private,
            requires_manual_allocation: true,
            timeout_alerted_at: new Date().toISOString(),
          },
        })
        .eq('id', requestId);

      if (updateErr) {
        console.error(`[process-timeouts] Failed to flag request ${requestId}:`, updateErr);
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
