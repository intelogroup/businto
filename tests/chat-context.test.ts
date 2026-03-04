import { describe, it, expect, vi } from 'vitest';
import { buildTripSummary, selectModel } from '@/app/api/chat/route';

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
