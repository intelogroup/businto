import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createClient } from '@/lib/supabase/server';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = await createClient();

  // 1. Get user session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Fetch user context (trips and requests)
  const { data: requests } = await supabase
    .from('transport_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  const contextPrompt = `
You are the Businto AI Assistant, a specialized expert in high-engagement transport logistics.
You help users manage their transport requests and provide insights based on their data.

CURRENT USER CONTEXT:
User ID: ${user.id}
Recent Transport Requests: ${JSON.stringify(requests || [], null, 2)}

APP CAPABILITIES:
- Service Types: School, Medical, Wedding, and Corporate transport.
- Real-time Quoting: Users receive multiple quotes from different operators.
- Specialized Logic: 
  - School: Recurring schedules, student safety details.
  - Medical: Mobility levels (ambulatory, wheelchair, stretcher), service levels.
  - Wedding/Corporate: Event itineraries, shuttle continuous modes, guest counts.
- Dashboard: Users can view their trips, accept quotes, and track notifications.

GUIDELINES:
- Be concise, professional, and helpful.
- Reference the user's specific trips if they ask about them.
- If they ask for something you can't do (like book a flight), steer them back to transport options.
- Use a helpful, friendly tone appropriate for a logistics professional.
`;

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: contextPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
