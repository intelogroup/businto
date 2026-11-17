import { NextRequest, NextResponse } from 'next/server';
import { generateSmartReplies } from '@/lib/ai';
import { supabaseAdmin, requireUser } from '@/lib/supabase/admin';
import { requestContextVisibleTo, bookingContextVisibleTo } from '@/lib/policy';
import { checkRateLimit } from '@/lib/rate-limit';

// BOUNDARY (BUS-CHAT-LLM-COST-001): same validate-bound-throttle
// discipline as /api/chat — platform-paid inference is rate-limited
// per authenticated user and the forwarded content is size-bounded
// before generateSmartReplies runs.
const SUGGESTIONS_RATE_LIMIT = 20; // calls per user per hour (default window)
const SUGGESTIONS_MAX_INPUT_CHARS = 10_000;

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Require authentication — smart replies use DB context
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, requestId, bookingId, role } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Throttle + input bound before the paid LLM call
    // (BUS-CHAT-LLM-COST-001). Only calls that would reach the model
    // consume budget — the empty-messages return above stays free.
    if (!checkRateLimit(`chat-suggestions:user:${user.id}`, SUGGESTIONS_RATE_LIMIT)) {
      return NextResponse.json({ error: 'Too many suggestion requests' }, { status: 429 });
    }
    const inputChars = messages.reduce(
      (total: number, m: any) => total + (typeof m?.content === 'string' ? m.content.length : 0),
      0
    );
    if (inputChars > SUGGESTIONS_MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'Message content is too large' }, { status: 400 });
    }

    // Fetch context from DB if IDs provided
    let context: any = {
      serviceType: 'transportation',
      status: 'active',
      role: role || 'user'
    };

    // POLICY (M4, BUS-CHAT-SUGGEST-FOREIGN-CONTEXT-001): context is loaded
    // only for a request/booking the caller owns or participates in —
    // a foreign id is treated exactly like a nonexistent one and the
    // defaults above stand, so a stranger's service_type/status never
    // enters the AI context. Shared predicates: src/lib/policy.ts.
    if (requestId) {
      const { data: request } = await supabaseAdmin
        .from('transport_requests')
        .select('service_type, status, user_id')
        .eq('id', requestId)
        .single();

      if (request && requestContextVisibleTo(request, user.id)) {
        context.serviceType = request.service_type;
        context.status = request.status;
      }
    } else if (bookingId) {
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('status, user_id, operator_id, transport_requests(service_type)')
        .eq('id', bookingId)
        .single();

      if (booking && bookingContextVisibleTo(booking, user.id)) {
        context.status = booking.status;
        context.serviceType = (booking as any).transport_requests?.service_type || 'transportation';
      }
    }

    // Map messages to roles for AI
    const lastThreeMessages = messages.slice(-3).map((m: any) => ({
      role: (m.sender_id === req.headers.get('x-user-id') ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content
    }));

    const suggestions = await generateSmartReplies(lastThreeMessages, context);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('API Suggestions Error:', error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
