import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/event-logger';
import { createClient } from '@/lib/supabase/server';
import { userMayBindLogsToRequest } from '@/lib/policy';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

/**
 * Public endpoint for client-side error/event logging.
 * Useful for catching errors that happen before a session is established
 * (e.g. operator opening a claim-job link with an expired token).
 *
 * SECURITY: user_id and operator_id from the request body are IGNORED.
 * Identity is derived from the session to prevent log poisoning / false attribution.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            event_type,
            status,
            message,
            metadata,
            request_id,
        } = body;

        if (!event_type) {
            return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
        }

        // Rate limit per client IP (shared limiter, src/lib/rate-limit.ts) —
        // this endpoint is intentionally reachable pre-session, so volume is
        // bounded here instead of by auth.
        if (!checkRateLimit(`logs:${getClientIP(request)}`, 60)) {
            return NextResponse.json({ error: 'Too many log submissions' }, { status: 429 });
        }

        // Resolve identity from session — never trust body-supplied user_id/operator_id
        let sessionUserId: string | null = null;
        try {
            const supabase = await createClient();
            const { data: { user } } = await supabase.auth.getUser();
            sessionUserId = user?.id ?? null;
        } catch {
            // Not authenticated — log without user association
        }

        // POLICY (M4, BUS-LOGS-FOREIGN-REQUEST-001): a log that BINDS to a
        // transport request requires a session and participation in that
        // request (owner, or operator with a quote — src/lib/policy.ts).
        // Without this, anyone could attach fabricated events (e.g. a fake
        // payment confirmation) to a stranger's request audit trail.
        // Unbound logs (no request_id) keep working pre-session, exactly
        // as before — that is what this endpoint exists for.
        if (request_id) {
            if (!sessionUserId) {
                return NextResponse.json(
                    { error: 'Authentication required to log against a request' },
                    { status: 401 }
                );
            }
            if (!(await userMayBindLogsToRequest(sessionUserId, request_id))) {
                return NextResponse.json(
                    { error: 'Not a participant in this request' },
                    { status: 403 }
                );
            }
        }

        // Forward to the internal event logger
        await logEvent({
            event_type: `client.${event_type}`,
            status: status || 'error',
            message: message || 'No message provided',
            metadata: {
                ...metadata,
                userAgent: request.headers.get('user-agent'),
                referer: request.headers.get('referer'),
                ip: request.headers.get('x-forwarded-for') || 'unknown',
            },
            request_id,
            user_id: sessionUserId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API Logs] Failed to record client log:', error);
        return NextResponse.json({ error: 'Internal logging failure' }, { status: 500 });
    }
}
