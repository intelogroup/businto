/**
 * Unit tests for the Phase 1 write core — src/lib/transitions.ts.
 *
 * transition(): one predicated update per candidate from-state; zero
 * rows is a typed refusal the caller must branch on (M1 + M2).
 * mergeMetadata(): claim (predicated touch) → re-read → predicated
 * write of the object merged from the FRESH read — never a snapshot
 * write-back (BUS-PASS-CLOBBER-001 / BUS-CRON-TIMEOUT-CLOBBER-001).
 *
 * The fake client mirrors the in-memory query-builder shape used by
 * the loop probes: filters are evaluated when the query executes, and
 * an onUpdate hook can land a "concurrent" write inside the first
 * update's execution window.
 */
import { describe, it, expect } from 'vitest';
import { transition, mergeMetadata, isTerminalBookingStatus } from '@/lib/transitions';

type Row = Record<string, any>;

function makeClient(store: Record<string, Row[]>, hooks: { onUpdate?: (table: string, row: Row) => void } = {}) {
  class QB {
    table: string;
    op = 'select';
    filters: Array<[string, string, any]> = [];
    payload: any = null;
    constructor(t: string) {
      this.table = t;
      if (!store[this.table]) store[this.table] = [];
    }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(['eq', k, v]); return this; }
    neq(k: string, v: any) { this.filters.push(['neq', k, v]); return this; }
    in(k: string, v: any[]) { this.filters.push(['in', k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) {
      return this.filters.every(([t, k, v]) =>
        t === 'eq' ? r[k] === v : t === 'neq' ? r[k] !== v : (v as any[]).includes(r[k]));
    }
    exec() {
      const rows = store[this.table];
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') {
        for (const r of matched) {
          if (hooks.onUpdate) { const h = hooks.onUpdate; hooks.onUpdate = undefined; h(this.table, r); }
          Object.assign(r, this.payload);
        }
      }
      return matched.map((r) => ({ ...r }));
    }
    async single() {
      const rows = this.exec();
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    }
    async maybeSingle() {
      const rows = this.exec();
      return { data: rows.length ? rows[0] : null, error: null };
    }
    then(res: any, rej: any) {
      try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); }
    }
  }
  return { from: (t: string) => new QB(t) };
}

describe('transition()', () => {
  it('applies the patch when the row is in an allowed from-state', async () => {
    const store = { bookings: [{ id: 'b1', status: 'confirmed', payment_status: 'unpaid' }] };
    const res = await transition(makeClient(store), {
      table: 'bookings',
      filters: [{ column: 'id', value: 'b1' }],
      guardField: 'status',
      from: ['confirmed', 'in_progress'],
      patch: { payment_status: 'paid' },
    });
    expect(res.ok).toBe(true);
    expect(store.bookings[0].payment_status).toBe('paid');
  });

  it('tries later from-states when the first does not match', async () => {
    const store = { bookings: [{ id: 'b1', status: 'in_progress' }] };
    const res = await transition(makeClient(store), {
      table: 'bookings',
      filters: [{ column: 'id', value: 'b1' }],
      guardField: 'status',
      from: ['confirmed', 'in_progress'],
      patch: { status: 'completed' },
    });
    expect(res.ok).toBe(true);
    expect(store.bookings[0].status).toBe('completed');
  });

  it('refuses with zero writes when the row left the allowed states', async () => {
    const store = { bookings: [{ id: 'b1', status: 'cancelled', payment_status: 'unpaid' }] };
    const res = await transition(makeClient(store), {
      table: 'bookings',
      filters: [{ column: 'id', value: 'b1' }],
      guardField: 'status',
      from: ['confirmed', 'in_progress'],
      patch: { payment_status: 'paid' },
    });
    expect(res).toEqual({ ok: false, kind: 'refused' });
    expect(store.bookings[0].payment_status).toBe('unpaid');
  });

  it('supports neq filters (decline-all-others shape)', async () => {
    const store = {
      quotes: [
        { id: 'q1', request_id: 'r1', status: 'pending' },
        { id: 'q2', request_id: 'r1', status: 'pending' },
        { id: 'q3', request_id: 'r1', status: 'accepted' },
      ],
    };
    const res = await transition(makeClient(store), {
      table: 'quotes',
      filters: [
        { column: 'request_id', value: 'r1' },
        { column: 'id', op: 'neq', value: 'q3' },
      ],
      guardField: 'status',
      from: ['pending'],
      patch: { status: 'declined' },
      select: 'operator_id',
    });
    expect(res.ok).toBe(true);
    expect(store.quotes.map((q) => q.status)).toEqual(['declined', 'declined', 'accepted']);
  });

  it('single mode returns the updated row', async () => {
    const store = { bookings: [{ id: 'b1', status: 'confirmed' }] };
    const res = await transition(makeClient(store), {
      table: 'bookings',
      filters: [{ column: 'id', value: 'b1' }],
      guardField: 'status',
      from: ['confirmed'],
      patch: { status: 'cancelled' },
      mode: 'single',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows[0].status).toBe('cancelled');
  });

  it('single mode refuses when no row matches', async () => {
    const store = { bookings: [{ id: 'b1', status: 'completed' }] };
    const res = await transition(makeClient(store), {
      table: 'bookings',
      filters: [{ column: 'id', value: 'b1' }],
      guardField: 'status',
      from: ['confirmed'],
      patch: { status: 'cancelled' },
      mode: 'single',
    });
    expect(res).toEqual({ ok: false, kind: 'refused' });
    expect(store.bookings[0].status).toBe('completed');
  });
});

describe('mergeMetadata()', () => {
  it('merges additions into the stored object, preserving existing keys', async () => {
    const store = {
      transport_requests: [
        { id: 'r1', status: 'pending', metadata_private: { parent_name: 'A' } },
      ],
    };
    const res = await mergeMetadata(makeClient(store), {
      table: 'transport_requests',
      id: 'r1',
      from: ['pending', 'quoted'],
      additions: { requires_manual_allocation: true },
    });
    expect(res.ok).toBe(true);
    expect(store.transport_requests[0].metadata_private).toEqual({
      parent_name: 'A',
      requires_manual_allocation: true,
    });
  });

  it('a concurrent metadata key landing inside the window survives the merge', async () => {
    const store = {
      transport_requests: [
        { id: 'r1', status: 'pending', metadata_private: { origin: 'seed' } },
      ],
    };
    const client = makeClient(store, {
      onUpdate: (_t, row) => {
        row.metadata_private = { ...row.metadata_private, priority_paid: true };
      },
    });
    const res = await mergeMetadata(client, {
      table: 'transport_requests',
      id: 'r1',
      from: ['pending', 'quoted'],
      additions: { requires_manual_allocation: true },
    });
    expect(res.ok).toBe(true);
    expect(store.transport_requests[0].metadata_private).toEqual({
      origin: 'seed',
      priority_paid: true,
      requires_manual_allocation: true,
    });
  });

  it('a state change landing inside the window refuses the merge — no flag written', async () => {
    const store = {
      transport_requests: [
        { id: 'r1', status: 'pending', metadata_private: { origin: 'seed' } },
      ],
    };
    const client = makeClient(store, {
      onUpdate: (_t, row) => { row.status = 'booked'; },
    });
    const res = await mergeMetadata(client, {
      table: 'transport_requests',
      id: 'r1',
      from: ['pending', 'quoted'],
      additions: { requires_manual_allocation: true },
    });
    expect(res).toEqual({ ok: false, kind: 'refused' });
    expect(store.transport_requests[0].status).toBe('booked');
    expect((store.transport_requests[0].metadata_private as any).requires_manual_allocation).toBeUndefined();
  });

  it('refuses outright when the row is not in an allowed state', async () => {
    const store = {
      transport_requests: [
        { id: 'r1', status: 'completed', metadata_private: {} },
      ],
    };
    const res = await mergeMetadata(makeClient(store), {
      table: 'transport_requests',
      id: 'r1',
      from: ['pending', 'quoted'],
      additions: { requires_manual_allocation: true },
    });
    expect(res).toEqual({ ok: false, kind: 'refused' });
  });

  it('isEligible can refuse on the fresh row (already-flagged case)', async () => {
    const store = {
      transport_requests: [
        { id: 'r1', status: 'pending', metadata_private: { timeout_alerted_at: '2026-01-01T00:00:00Z' } },
      ],
    };
    const res = await mergeMetadata(makeClient(store), {
      table: 'transport_requests',
      id: 'r1',
      from: ['pending', 'quoted'],
      additions: { requires_manual_allocation: true },
      isEligible: (fresh) => !fresh.metadata_private?.timeout_alerted_at,
    });
    expect(res).toEqual({ ok: false, kind: 'refused' });
    expect((store.transport_requests[0].metadata_private as any).requires_manual_allocation).toBeUndefined();
  });
});

describe('isTerminalBookingStatus()', () => {
  it('flags cancelled and completed only', () => {
    expect(isTerminalBookingStatus('cancelled')).toBe(true);
    expect(isTerminalBookingStatus('completed')).toBe(true);
    expect(isTerminalBookingStatus('confirmed')).toBe(false);
    expect(isTerminalBookingStatus('in_progress')).toBe(false);
    expect(isTerminalBookingStatus(null)).toBe(false);
    expect(isTerminalBookingStatus(undefined)).toBe(false);
  });
});
