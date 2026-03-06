import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/event-logger';
import { createClient } from '@/lib/supabase/server';

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

        // Resolve identity from session — never trust body-supplied user_id/operator_id
        let sessionUserId: string | null = null;
        try {
            const supabase = await createClient();
            const { data: { user } } = await supabase.auth.getUser();
            sessionUserId = user?.id ?? null;
        } catch {
            // Not authenticated — log without user association
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
