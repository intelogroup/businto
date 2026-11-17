import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/event-logger';
import { createClient } from '@/lib/supabase/server';
import { userMayBindLogsToRequest } from '@/lib/policy';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { parsePlainObject, parseTextField } from '@/lib/boundary';

// BOUNDARY (BUS-LOGS-SHAPE-FLOOD-001): every field this public
// endpoint forwards to the event log is shape-validated and
// size-bounded before logEvent — a non-string or oversized
// event_type, an arbitrary status, and caller-sized
// message/metadata/request_id were previously stored verbatim.
const LOG_EVENT_TYPE_MAX_CHARS = 100;
const LOG_MESSAGE_MAX_CHARS = 2000;
const LOG_METADATA_MAX_JSON_CHARS = 5000;
const LOG_REQUEST_ID_MAX_CHARS = 200;
// The status vocabulary the real client pages send. A supplied
// status outside it is never forwarded verbatim — it normalizes to
// 'error', the route's long-standing default.
const LOG_STATUSES = ['success', 'error', 'info'] as const;
// Burst bound in front of the hourly cap below: 20 submissions per
// minute per IP absorbs genuine client error bursts while a scripted
// flood is throttled long before the hourly budget matters.
const LOG_BURST_LIMIT = 20;
const LOG_BURST_WINDOW_MS = 60 * 1000;

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

        // Shape validation (BUS-LOGS-SHAPE-FLOOD-001): each field is
        // the type it claims to be, within its size bound, before
        // anything is throttled, bound, or logged.
        const parsedEventType = parseTextField(event_type, 'event_type');
        if (!parsedEventType.ok || parsedEventType.value.length > LOG_EVENT_TYPE_MAX_CHARS) {
            return NextResponse.json(
                { error: `event_type must be a string of at most ${LOG_EVENT_TYPE_MAX_CHARS} characters` },
                { status: 400 }
            );
        }
        const logStatus = (LOG_STATUSES as readonly string[]).includes(status) ? status : 'error';
        let logMessage = 'No message provided';
        if (message !== undefined && message !== null) {
            const parsedMessage = parseTextField(message, 'message');
            if (!parsedMessage.ok) {
                return NextResponse.json({ error: parsedMessage.error }, { status: 400 });
            }
            logMessage = parsedMessage.value.slice(0, LOG_MESSAGE_MAX_CHARS) || 'No message provided';
        }
        let logMetadata: Record<string, unknown> | undefined;
        if (metadata !== undefined && metadata !== null) {
            const parsedMetadata = parsePlainObject(metadata, 'metadata');
            if (!parsedMetadata.ok) {
                return NextResponse.json({ error: parsedMetadata.error }, { status: 400 });
            }
            if (JSON.stringify(parsedMetadata.value).length > LOG_METADATA_MAX_JSON_CHARS) {
                return NextResponse.json({ error: 'metadata is too large' }, { status: 400 });
            }
            logMetadata = parsedMetadata.value;
        }
        if (request_id !== undefined && request_id !== null) {
            const parsedRequestId = parseTextField(request_id, 'request_id');
            if (!parsedRequestId.ok || parsedRequestId.value.length > LOG_REQUEST_ID_MAX_CHARS) {
                return NextResponse.json(
                    { error: `request_id must be a string of at most ${LOG_REQUEST_ID_MAX_CHARS} characters` },
                    { status: 400 }
                );
            }
        }

        // Rate limit per client IP (shared limiter, src/lib/rate-limit.ts) —
        // this endpoint is intentionally reachable pre-session, so volume is
        // bounded here instead of by auth: a per-minute burst bound in
        // front of the hourly cap (BUS-LOGS-SHAPE-FLOOD-001).
        const clientIP = getClientIP(request);
        if (
            !checkRateLimit(`logs:burst:${clientIP}`, LOG_BURST_LIMIT, LOG_BURST_WINDOW_MS) ||
            !checkRateLimit(`logs:${clientIP}`, 60)
        ) {
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

        // Forward to the internal event logger — the validated,
        // bounded values above, never the raw body fields.
        await logEvent({
            event_type: `client.${parsedEventType.value}`,
            status: logStatus,
            message: logMessage,
            metadata: {
                ...logMetadata,
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
