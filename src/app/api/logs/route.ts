import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/event-logger';

/**
 * Public endpoint for client-side error/event logging.
 * Useful for catching errors that happen before a session is established
 * (e.g. operator opening a claim-job link with an expired token).
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
            operator_id,
            user_id
        } = body;

        if (!event_type) {
            return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
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
            operator_id,
            user_id
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API Logs] Failed to record client log:', error);
        return NextResponse.json({ error: 'Internal logging failure' }, { status: 500 });
    }
}
