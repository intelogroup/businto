import { openai, createOpenAI } from '@ai-sdk/openai';
import { streamText, convertToModelMessages } from 'ai';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 30;

// BOUNDARY (BUS-CHAT-LLM-COST-001): platform-paid LLM inference is
// bounded per authenticated principal — in rate and in per-call
// input size — before streamText runs. Every other expensive route
// throttles with checkRateLimit; this one called the model with no
// rate limit and no bound on the forwarded message payload.
const CHAT_RATE_LIMIT = 20; // calls per user per hour (default window)
const CHAT_MAX_MESSAGES = 50;
const CHAT_MAX_INPUT_CHARS = 100_000;

export function buildTripSummary(requests: any[]): string {
  if (!requests || requests.length === 0) return 'No recent trips found.';
  return requests.map((r: any) => {
    const quotes: any[] = r.quotes || [];
    const acceptedQuote = quotes.find((q: any) => q.status === 'accepted');
    const pendingQuotes = quotes.filter((q: any) => q.status === 'pending').length;
    let tripState = '';
    if (r.status === 'booked' && acceptedQuote) {
      tripState = `BOOKED at $${acceptedQuote.total_price ?? acceptedQuote.amount}`;
    } else if (quotes.length > 0) {
      tripState = `QUOTED — ${quotes.length} quote(s) received, ${pendingQuotes} pending`;
    } else {
      tripState = `PENDING — awaiting operator quotes`;
    }
    const date = new Date(r.created_at).toLocaleDateString();
    return `- Trip ${r.id.slice(0, 8).toUpperCase()} | ${(r.service_type as string).toUpperCase()} | ${tripState} | Submitted: ${date}`;
  }).join('\n');
}

export function selectModel(provider: string) {
  if (provider === 'groq') {
    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    });
    return groq('llama-3.3-70b-versatile');
  }
  return openai('gpt-4o-mini');
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Throttle before any database or model work (BUS-CHAT-LLM-COST-001).
  if (!checkRateLimit(`chat:user:${user.id}`, CHAT_RATE_LIMIT)) {
    return NextResponse.json(
      { error: 'Too many chat requests. Please wait before sending another message.' },
      { status: 429 }
    );
  }

  // Input bound: the message list is an array of bounded count and
  // bounded total size before it is converted and forwarded to the
  // model — never the caller's payload verbatim at any size.
  if (
    !Array.isArray(messages) ||
    messages.length > CHAT_MAX_MESSAGES ||
    JSON.stringify(messages).length > CHAT_MAX_INPUT_CHARS
  ) {
    return NextResponse.json({ error: 'Chat input is too large' }, { status: 400 });
  }

  const { data: requests } = await supabase
    .from('transport_requests')
    .select(`id, service_type, status, created_at, quotes(id, status, total_price)`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const tripSummary = buildTripSummary(requests ?? []);

  const provider = process.env.AI_PROVIDER || 'openai';
  const model = selectModel(provider);

  const contextPrompt = `
You are the Businto AI Assistant, a specialized expert in transport logistics dispatch.
You help users manage their transport requests and provide insights based on their data.

CURRENT USER CONTEXT:
User ID: ${user.id}
Recent Trip Activity:
${tripSummary}

APP CAPABILITIES:
- Service Types: School Runs, Medical (Care Rides), and Event Shuttles (Weddings, Corporate).
- Real-time Quoting: Users receive multiple quotes from operators. They accept one to book.
- Specialized Logic:
  - School: Recurring schedules, student safety details, guardian/security info.
  - Medical: Mobility levels (ambulatory, wheelchair, stretcher), service levels.
  - Wedding/Event: Itineraries, shuttle modes, guest counts.
- Dashboard: View trips, accept quotes, track notifications.

GUIDELINES:
- Be concise, professional, and helpful.
- Reference the user's specific trips by their Trip ID (e.g. "Trip ABCD1234") when relevant.
- If they ask for something outside transport, redirect to transport options.
- If they want to book a new trip, direct them to the forms on the dashboard or landing page.
`;

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system: contextPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
