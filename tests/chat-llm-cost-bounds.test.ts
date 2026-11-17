/**
 * PERMANENT REGRESSION — BUS-CHAT-LLM-COST-001 (converted from the loop probe of cycle 2026-11-16-0952; assertions unchanged)
 * POST /api/chat and POST /api/chat/suggestions invoke paid LLM inference
 * (streamText / generateSmartReplies -> generateText) for any authenticated
 * principal with no rate limit and no message count/length bound, unlike
 * other expensive routes that use checkRateLimit.
 * Invariant: platform-paid LLM inference per authenticated principal is
 * bounded in rate and per-call input size — excess rate refused (429) and
 * oversized input refused (400/413) or truncated before the LLM call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() }, requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/ai', () => ({ generateSmartReplies: vi.fn() }));
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(() => 'mock-model'), createOpenAI: vi.fn(() => vi.fn(() => 'mock-groq-model')) }));
vi.mock('ai', () => ({ streamText: vi.fn(), convertToModelMessages: vi.fn(async (m: any) => m) }));

const USER = { id: 'user-1' };
function chainEmpty() {
  const c: any = {};
  c.select = vi.fn().mockReturnValue(c); c.eq = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c); c.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  c.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return c;
}
async function setup() {
  const { createClient } = await import('@/lib/supabase/server');
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
    from: vi.fn(() => chainEmpty()),
  });
  const { requireUser, supabaseAdmin } = await import('@/lib/supabase/admin');
  (requireUser as any).mockResolvedValue(USER);
  (supabaseAdmin as any).from = vi.fn(() => chainEmpty());
  const { streamText } = await import('ai');
  (streamText as any).mockReturnValue({ toUIMessageStreamResponse: vi.fn(() => new NextResponse('stream', { status: 200 })) });
  const { generateSmartReplies } = await import('@/lib/ai');
  (generateSmartReplies as any).mockResolvedValue(['ok']);
  return { streamText, generateSmartReplies };
}
function chatReq(messages: any) {
  return new Request('http://localhost/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
}
function suggReq(body: any) {
  return new NextRequest('http://localhost/api/chat/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('chat LLM cost bounds', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('control: single normal chat call reaches LLM once, 200', async () => {
    const { streamText } = await setup();
    const { POST } = await import('@/app/api/chat/route');
    const r = await POST(chatReq([{ role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] }]));
    expect(r.status).toBe(200);
    expect((streamText as any).mock.calls.length).toBe(1);
  });
  it('attack: 25 rapid chat calls are throttled before the LLM (some 429 / not all reach streamText)', async () => {
    const { streamText } = await setup();
    const { POST } = await import('@/app/api/chat/route');
    let statuses: number[] = [];
    for (let i = 0; i < 25; i++) { const r = await POST(chatReq([{ role: 'user', content: 'hi' }])); statuses.push(r.status); }
    // Invariant: not every call reaches the paid LLM; at least one refusal
    expect((streamText as any).mock.calls.length).toBeLessThan(25);
    expect(statuses.some((s: number) => s === 429 || s === 400)).toBe(true);
  });
  it('attack: oversized chat input refused or truncated before the LLM', async () => {
    const { streamText } = await setup();
    const { POST } = await import('@/app/api/chat/route');
    const huge = 'x'.repeat(50000);
    const messages = Array.from({ length: 200 }, () => ({ role: 'user', content: huge }));
    const r = await POST(chatReq(messages));
    if (r.status === 200) {
      // if accepted, forwarded payload must be bounded well below input size
      const arg = (streamText as any).mock.calls[0][0];
      const forwarded = JSON.stringify(arg.messages || arg);
      expect(forwarded.length).toBeLessThan(200000);
    } else {
      expect([400, 413, 429]).toContain(r.status);
    }
  });
  it('attack: 25 rapid suggestions calls are throttled before the LLM', async () => {
    const { generateSmartReplies } = await setup();
    const { POST } = await import('@/app/api/chat/suggestions/route');
    let statuses: number[] = [];
    for (let i = 0; i < 25; i++) { const r = await POST(suggReq({ messages: [{ content: 'hi', sender_id: 'x' }] })); statuses.push(r.status); }
    expect((generateSmartReplies as any).mock.calls.length).toBeLessThan(25);
    expect(statuses.some((s: number) => s === 429 || s === 400)).toBe(true);
  });
  it('attack: oversized suggestions content refused or truncated before the LLM', async () => {
    const { generateSmartReplies } = await setup();
    const { POST } = await import('@/app/api/chat/suggestions/route');
    const huge = 'y'.repeat(200000);
    const r = await POST(suggReq({ messages: [{ content: huge, sender_id: 'x' }] }));
    if (r.status === 200) {
      const msgs = (generateSmartReplies as any).mock.calls[0][0];
      const forwarded = JSON.stringify(msgs);
      expect(forwarded.length).toBeLessThan(20000);
    } else {
      expect([400, 413, 429]).toContain(r.status);
    }
  });
});
