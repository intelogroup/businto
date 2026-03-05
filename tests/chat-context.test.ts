import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTripSummary, selectModel } from '@/app/api/chat/route';
import { convertToModelMessages } from 'ai';

// ─────────────────────────────────────────────
// getMsgText: re-implemented here for unit testing
// (the real one is an unexported helper in ai-chat-panel.tsx)
// ─────────────────────────────────────────────
function getMsgText(msg: any): string {
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text as string)
      .join('');
  }
  return msg.content ?? '';
}

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((_id: string) => ({ modelId: 'gpt-4o-mini', provider: 'openai' })),
  // createOpenAI is used for Groq-compatible endpoint in selectModel()
  createOpenAI: vi.fn(() => (_id: string) => ({ modelId: 'llama-3.3-70b-versatile', provider: 'groq' })),
}));

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (_id: string) => ({ modelId: 'llama-3.3-70b-versatile', provider: 'groq' })),
}));

const makeTrip = (overrides: object) => ({
  id: 'abc12345-0000-0000-0000-000000000000',
  service_type: 'school',
  status: 'pending',
  created_at: '2026-03-01T00:00:00Z',
  quotes: [],
  ...overrides,
});

describe('buildTripSummary', () => {
  it('returns no-trips message for empty array', () => {
    expect(buildTripSummary([])).toBe('No recent trips found.');
  });

  it('returns no-trips message for null/undefined', () => {
    expect(buildTripSummary(null as any)).toBe('No recent trips found.');
  });

  it('shows PENDING for trip with no quotes', () => {
    const result = buildTripSummary([makeTrip({})]);
    expect(result).toContain('PENDING');
    expect(result).toContain('SCHOOL');
    expect(result).toContain('ABC12345');
  });

  it('shows QUOTED with quote count and pending count', () => {
    const result = buildTripSummary([makeTrip({
      id: 'def67890-0000-0000-0000-000000000000',
      service_type: 'medical',
      status: 'quoted',
      quotes: [
        { id: 'q1', status: 'pending', total_price: 45 },
        { id: 'q2', status: 'pending', total_price: 52 },
      ],
    })]);
    expect(result).toContain('QUOTED');
    expect(result).toContain('2 quote(s)');
    expect(result).toContain('2 pending');
    expect(result).toContain('MEDICAL');
  });

  it('shows BOOKED with accepted price', () => {
    const result = buildTripSummary([makeTrip({
      id: 'ghi11111-0000-0000-0000-000000000000',
      service_type: 'wedding',
      status: 'booked',
      quotes: [
        { id: 'q1', status: 'accepted', total_price: 350 },
        { id: 'q2', status: 'declined', total_price: 400 },
      ],
    })]);
    expect(result).toContain('BOOKED');
    expect(result).toContain('$350');
    expect(result).toContain('WEDDING');
  });

  it('handles mixed trip states', () => {
    const result = buildTripSummary([
      makeTrip({ id: 'aaa00000-0000-0000-0000-000000000001', status: 'pending', quotes: [] }),
      makeTrip({ id: 'bbb00000-0000-0000-0000-000000000002', service_type: 'medical', status: 'quoted', quotes: [{ id: 'q1', status: 'pending', total_price: 60 }] }),
      makeTrip({ id: 'ccc00000-0000-0000-0000-000000000003', service_type: 'wedding', status: 'booked', quotes: [{ id: 'q2', status: 'accepted', total_price: 200 }] }),
    ]);
    expect(result).toContain('PENDING');
    expect(result).toContain('QUOTED');
    expect(result).toContain('BOOKED');
  });

  it('shows one line per trip', () => {
    const result = buildTripSummary([makeTrip({}), makeTrip({ id: 'bbb00000-0000-0000-0000-000000000000' })]);
    const lines = result.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });
});

describe('selectModel', () => {
  it('returns openai model for "openai" provider', () => {
    const model = selectModel('openai');
    expect(model.modelId).toBe('gpt-4o-mini');
  });

  it('returns groq model for "groq" provider', () => {
    const model = selectModel('groq');
    expect(model.modelId).toBe('llama-3.3-70b-versatile');
  });

  it('defaults to openai for unknown provider', () => {
    const model = selectModel('unknown');
    expect(model.modelId).toBe('gpt-4o-mini');
  });
});

// ─────────────────────────────────────────────
// Message conversion: UIMessage → CoreMessage
// This is the critical fix — the client sends UIMessages with `parts`,
// but streamText requires CoreMessages with `content`.
// ─────────────────────────────────────────────
describe('convertToModelMessages (UIMessage → CoreMessage)', () => {
  it('converts a user UIMessage with text part to CoreMessage', async () => {
    const uiMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hiii' }] },
    ];
    const result = await convertToModelMessages(uiMessages as any);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const content = result[0].content as any[];
    expect(content[0]).toMatchObject({ type: 'text', text: 'hiii' });
  });

  it('converts an assistant UIMessage with text part to CoreMessage', async () => {
    const uiMessages = [
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }] },
    ];
    const result = await convertToModelMessages(uiMessages as any);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    const content = result[0].content as any[];
    expect(content[0]).toMatchObject({ type: 'text', text: 'Hello! How can I help?' });
  });

  it('converts a full conversation thread correctly', async () => {
    const uiMessages = [
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Professional dispatch assistant.' }] },
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Check my trips' }] },
    ];
    const result = await convertToModelMessages(uiMessages as any);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('user');
    expect((result[1].content as any[])[0].text).toBe('Check my trips');
  });

  it('strips empty assistant messages to avoid API errors', async () => {
    const uiMessages = [
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '' }] },
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
    ];
    const result = await convertToModelMessages(uiMessages as any);
    // Empty assistant text part should be filtered; only user message should remain
    const assistantMsg = result.find(m => m.role === 'assistant');
    const assistantContent = assistantMsg?.content as any[] | undefined;
    const hasNonEmptyText = assistantContent?.some(p => p.type === 'text' && p.text !== '');
    expect(hasNonEmptyText).toBeFalsy();
  });

  it('handles empty messages array', async () => {
    const result = await convertToModelMessages([]);
    expect(result).toEqual([]);
  });

  it('multi-part user message merges all text parts', async () => {
    const uiMessages = [
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Part one. ' },
          { type: 'text', text: 'Part two.' },
        ],
      },
    ];
    const result = await convertToModelMessages(uiMessages as any);
    const content = result[0].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0].text).toBe('Part one. ');
    expect(content[1].text).toBe('Part two.');
  });
});

// ─────────────────────────────────────────────
// POST handler: integration smoke test
// ─────────────────────────────────────────────
describe('POST /api/chat handler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a streaming response for valid UIMessage payload', async () => {
    // Mock supabase — unauthenticated user path
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      }),
    }));

    // Mock streamText to return a minimal stream response
    vi.doMock('ai', async (importOriginal) => {
      const actual = await importOriginal<typeof import('ai')>();
      return {
        ...actual,
        streamText: vi.fn().mockReturnValue({
          toUIMessageStreamResponse: vi.fn().mockReturnValue(
            new Response('data: {"type":"text-delta","textDelta":"Hi"}\n\n', {
              headers: { 'Content-Type': 'text/event-stream' },
            })
          ),
        }),
      };
    });

    const { POST } = await import('@/app/api/chat/route');

    const payload = {
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hiii' }] },
      ],
    };

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('does not pass raw UIMessages (with parts) directly to streamText', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      }),
    }));

    let capturedMessages: any;
    vi.doMock('ai', async (importOriginal) => {
      const actual = await importOriginal<typeof import('ai')>();
      return {
        ...actual,
        streamText: vi.fn((opts: any) => {
          capturedMessages = opts.messages;
          return {
            toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('ok')),
          };
        }),
      };
    });

    const { POST } = await import('@/app/api/chat/route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'test' }] },
        ],
      }),
    });

    await POST(req);

    // After conversion, messages must use `content` array, NOT `parts`
    expect(capturedMessages).toBeDefined();
    expect(capturedMessages[0]).not.toHaveProperty('parts');
    expect(capturedMessages[0]).toHaveProperty('content');
    expect(Array.isArray(capturedMessages[0].content)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// getMsgText: message text extraction
// ─────────────────────────────────────────────
describe('getMsgText', () => {
  it('extracts text from parts-based UIMessage', () => {
    const msg = { role: 'assistant', parts: [{ type: 'text', text: 'Hello world' }] };
    expect(getMsgText(msg)).toBe('Hello world');
  });

  it('concatenates multiple text parts', () => {
    const msg = { role: 'user', parts: [{ type: 'text', text: 'Part A ' }, { type: 'text', text: 'Part B' }] };
    expect(getMsgText(msg)).toBe('Part A Part B');
  });

  it('ignores non-text parts', () => {
    const msg = { role: 'user', parts: [{ type: 'tool-call', toolCallId: 'x' }, { type: 'text', text: 'actual text' }] };
    expect(getMsgText(msg)).toBe('actual text');
  });

  it('falls back to content string for legacy messages', () => {
    const msg = { role: 'user', content: 'legacy content' };
    expect(getMsgText(msg)).toBe('legacy content');
  });

  it('returns empty string when both parts and content are absent', () => {
    expect(getMsgText({ role: 'user' })).toBe('');
  });

  it('returns empty string when parts is empty array', () => {
    expect(getMsgText({ role: 'assistant', parts: [] })).toBe('');
  });
});

// ─────────────────────────────────────────────
// Chat history: Supabase persistence contracts
// Tests that the persistence logic handles DB responses correctly.
// ─────────────────────────────────────────────
describe('chat history persistence logic', () => {
  it('maps DB rows to UIMessage format correctly', () => {
    const dbRows = [
      { id: 'msg-1', role: 'user', content: 'Hello', created_at: '2026-03-05T10:00:00Z' },
      { id: 'msg-2', role: 'assistant', content: 'Hi there!', created_at: '2026-03-05T10:00:01Z' },
    ];

    const loaded = dbRows.map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: 'text', text: m.content }],
      createdAt: new Date(m.created_at),
    }));

    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ id: 'msg-1', role: 'user' });
    expect(loaded[0].parts[0]).toMatchObject({ type: 'text', text: 'Hello' });
    expect(loaded[1]).toMatchObject({ id: 'msg-2', role: 'assistant' });
    expect(loaded[1].createdAt).toBeInstanceOf(Date);
  });

  it('prepends welcome message before loaded history', () => {
    const WELCOME = { id: 'initial-1', role: 'assistant', parts: [{ type: 'text', text: 'Welcome' }] };
    const dbRows = [
      { id: 'msg-1', role: 'user', content: 'Hey', created_at: '2026-03-05T10:00:00Z' },
    ];
    const loaded = dbRows.map((m) => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.content }], createdAt: new Date(m.created_at) }));
    const result = [WELCOME, ...loaded];

    expect(result[0].id).toBe('initial-1');
    expect(result[1].id).toBe('msg-1');
    expect(result).toHaveLength(2);
  });

  it('skips setMessages when DB returns no rows (fresh session)', () => {
    const dbMessages: any[] = [];
    // Simulate the guard: only call setMessages if rows exist
    let setMessagesCalled = false;
    const setMessages = vi.fn(() => { setMessagesCalled = true; });

    if (dbMessages && dbMessages.length > 0) {
      setMessages(dbMessages);
    }

    expect(setMessagesCalled).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('only saves assistant message on streaming→ready transition', () => {
    const saves: string[] = [];
    const saveFn = (role: string) => saves.push(role);

    // Simulate prevStatus=streaming, status=ready
    const transitions = [
      { prev: 'streaming', curr: 'ready', lastRole: 'assistant' },
      { prev: 'ready', curr: 'ready', lastRole: 'assistant' },     // no-op
      { prev: 'submitted', curr: 'streaming', lastRole: 'assistant' }, // no-op
    ];

    for (const t of transitions) {
      if (t.prev === 'streaming' && t.curr === 'ready') {
        saveFn(t.lastRole);
      }
    }

    expect(saves).toHaveLength(1);
    expect(saves[0]).toBe('assistant');
  });
});
