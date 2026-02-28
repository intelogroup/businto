import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createClient } from '@/lib/supabase/server';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = await createClient();

  // 1. Get user session (Optional for landing page chat)
  const { data: { user } } = await supabase.auth.getUser();
  
  let requests: any[] = [];
  if (user) {
    // 2. Fetch user context (trips and requests) if logged in
    const { data } = await supabase
      .from('transport_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    requests = data || [];
  }

  const contextPrompt = `
You are the Businto AI Assistant, a specialized expert in high-engagement transport logistics.
You help users manage their transport requests and provide insights based on their data.

${user ? `CURRENT USER CONTEXT:
User ID: ${user.id}
Recent Transport Requests: ${JSON.stringify(requests, null, 2)}` : 'The user is not logged in. You are acting as a landing page assistant to guide them.'}

APP CAPABILITIES:
- Service Types: School, Medical (Care Rides), and Event Shuttles (Weddings).
- Real-time Quoting: Users receive multiple quotes from different operators.
- Specialized Logic: 
  - School: Recurring schedules, student safety details.
  - Medical: Mobility levels (ambulatory, wheelchair, stretcher), service levels.
  - Wedding/Event: Itineraries, shuttle modes, guest counts.
- Dashboard: Users can view their trips, accept quotes, and track notifications.

GUIDELINES:
- Be concise, professional, and helpful.
- Reference the user's specific trips if they are logged in and ask about them.
- If they ask for something you can't do (like book a flight), steer them back to transport options.
- Use a helpful, friendly tone appropriate for a logistics professional.
- If they want to book, tell them to use the forms on the dashboard or landing page.
`;

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: contextPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
