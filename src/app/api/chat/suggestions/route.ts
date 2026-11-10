import { NextRequest, NextResponse } from 'next/server';
import { generateSmartReplies } from '@/lib/ai';
import { supabaseAdmin, requireUser } from '@/lib/supabase/admin';
import { requestContextVisibleTo, bookingContextVisibleTo } from '@/lib/policy';

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
