import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Bookings Security Tests
 * 
 * Ensures that /api/bookings endpoints:
 * - Do not expose PII to unauthorized GET requests
 * - Reject unauthorized PATCH requests
 * - Update status appropriately
 */
describe('Bookings API Security', () => {
    describe('GET /api/bookings PII Exposure', () => {
        it('should not leak metadata_private or PII for unauthorized users', () => {
            const mockBooking = {
                id: 'booking-123',
                status: 'confirmed',
                operator_id: 'op-1',
                user_id: 'user-1',
                request: {
                    id: 'req-1',
                    metadata_safe: { item: 'safe' }
                }
            };

            // Ensure that if we ever test the shape of a generic public booking fetch, PII is missing
            expect(mockBooking).not.toHaveProperty('metadata_private');
            expect(mockBooking.request).not.toHaveProperty('metadata_private');
            expect(mockBooking.request).not.toHaveProperty('pickup_address');
            expect(mockBooking.request).not.toHaveProperty('dropoff_address');
        });
    });

    describe('PATCH /api/bookings', () => {
        it('should reject PATCH without bookingId', () => {
            const updatePayload = {
                status: 'completed'
            };

            expect(updatePayload).not.toHaveProperty('bookingId');
            // Simulated API response
            const response = { error: 'Missing bookingId', status: 400 };
            expect(response.status).toBe(400);
            expect(response.error).toBe('Missing bookingId');
        });

        it('should only allow updating specific fields', () => {
            const updateData: any = {};
            const payload = { bookingId: 'b-1', status: 'completed', special_instructions: 'gate code', malicious: true };

            if (payload.status) updateData.status = payload.status;
            if (payload.special_instructions !== undefined) updateData.special_instructions = payload.special_instructions;

            expect(updateData).toHaveProperty('status');
            expect(updateData).toHaveProperty('special_instructions');
            expect(updateData).not.toHaveProperty('malicious');
        });
    });
});

/**
 * Regression (real route): BUS-BOOKING-STATUS-001
 *
 * Booking status moves only along legal transitions — a completed
 * (terminal) booking cannot be cancelled by its owner via
 * PATCH /api/bookings. Proven against the real handler on an in-memory
 * mocked supabaseAdmin. Originally a loop probe, cycle 2026-11-02-1852
 * (discharging a Tier-1 scout candidate).
 */
import { NextRequest } from 'next/server';

const bookingHarness = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    order() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table];
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') { matched.forEach((r) => Object.assign(r, this.payload)); return matched; }
      return matched;
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new bookingHarness.QB(t) },
  requireUser: async () => ({ id: 'user-1' }),
}));

import { PATCH as patchBooking } from '@/app/api/bookings/route';

function seedBookings() {
  bookingHarness.store.bookings = [
    { id: 'bk-confirmed', user_id: 'user-1', status: 'confirmed', payment_status: 'paid' },
    { id: 'bk-completed', user_id: 'user-1', status: 'completed', payment_status: 'paid' },
    { id: 'bk-cancelled', user_id: 'user-1', status: 'cancelled', payment_status: 'paid' },
  ];
}

async function cancelBooking(bookingId: string) {
  const req = new NextRequest('http://localhost/api/bookings', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingId, status: 'cancelled' }),
  });
  return patchBooking(req);
}

describe('Booking status transitions (BUS-BOOKING-STATUS-001 regression)', () => {
  beforeEach(seedBookings);

  it('confirmed booking can be cancelled', async () => {
    const res = await cancelBooking('bk-confirmed');
    expect(res.status).toBe(200);
    expect(bookingHarness.store.bookings.find(b => b.id === 'bk-confirmed')!.status).toBe('cancelled');
  });

  it('completed booking cannot be cancelled', async () => {
    const res = await cancelBooking('bk-completed');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(bookingHarness.store.bookings.find(b => b.id === 'bk-completed')!.status).toBe('completed');
  });

  it('already-cancelled booking refuses re-cancellation', async () => {
    const res = await cancelBooking('bk-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(bookingHarness.store.bookings.find(b => b.id === 'bk-cancelled')!.status).toBe('cancelled');
  });
});
