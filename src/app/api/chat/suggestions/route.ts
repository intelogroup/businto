import { NextRequest, NextResponse } from 'next/server';
import { generateSmartReplies } from '@/lib/ai';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';

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

    if (requestId) {
      const { data: request } = await supabaseAdmin
        .from('transport_requests')
        .select('service_type, status')
        .eq('id', requestId)
        .single();
      
      if (request) {
        context.serviceType = request.service_type;
        context.status = request.status;
      }
    } else if (bookingId) {
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('status, transport_requests(service_type)')
        .eq('id', bookingId)
        .single();
      
      if (booking) {
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
