import { supabaseAdmin } from '@/lib/supabase-server';

type EventStatus = 'success' | 'error';

interface LogEventInput {
  event_type: string;
  status?: EventStatus;
  actor_type?: string;
  actor_id?: string | null;
  user_id?: string | null;
  operator_id?: string | null;
  request_id?: string | null;
  quote_id?: string | null;
  booking_id?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort event logging. Never throws into request flow.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('event_logs')
      .insert({
        ...input,
        status: input.status || 'success',
        metadata: input.metadata || {},
      });

    if (error) {
      console.error('Failed to persist event log:', error);
    }
  } catch (err) {
    console.error('Unexpected event logger failure:', err);
  }
}
