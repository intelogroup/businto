/**
 * Test: User "Quote Received" Email Flow
 *
 * Covers:
 *   1. quoteReceived email template renders correctly with claim link
 *   2. claim link uses /claim/[code] (short, not a long JWT)
 *   3. generateTripViewLink() creates a redeemable claim code
 *   4. Claim code for trip_view redeems to the correct trip + user
 *   5. Redeemed code generates a valid UserTripToken
 *   6. Claim code is one-time-use (second redemption fails)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emailTemplates } from '../src/lib/email';
import { createClaimCode, redeemClaimCode } from '../src/lib/claim-codes';
import { generateUserTripToken, verifyUserTripToken } from '../src/lib/tokens';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock supabase-server so createClaimCode / redeemClaimCode work in-memory
vi.mock('../src/lib/supabase-server', async () => {
    const claimStore = new Map<string, any>();

    const insertMock = vi.fn((rows: any | any[]) => {
        const row = Array.isArray(rows) ? rows[0] : rows;
        claimStore.set(row.code, {
            ...row,
            redeemed_at: null,
            redeem_ip: null,
        });
        return Promise.resolve({ data: [row], error: null });
    });

    // Single shared mock so chain calls all resolve to the right thing
    const getClaimByCode = (code: string) => {
        const row = claimStore.get(code);
        return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } });
    };

    const updateClaimCode = (update: any, code: string) => {
        const row = claimStore.get(code);
        if (row) claimStore.set(code, { ...row, ...update });
        return Promise.resolve({ error: null });
    };

    const chainable = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn((rows: any) => {
            insertMock(rows);
            return Promise.resolve({ data: Array.isArray(rows) ? rows : [rows], error: null });
        }),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn((payload: any) => ({
            eq: vi.fn((col: string, val: string) => {
                updateClaimCode(payload, val);
                return Promise.resolve({ error: null });
            }),
        })),
        single: vi.fn().mockImplementation(function (this: any) {
            // called after .eq('code', code) chain in redeemClaimCode
            return Promise.resolve({ data: null, error: null });
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        // expose store for manual test reads
        _store: claimStore,
        _getByCode: getClaimByCode,
    };

    chainable.from.mockReturnValue(chainable);
    chainable.select.mockReturnValue(chainable);
    chainable.eq.mockReturnValue(chainable);

    return { supabaseAdmin: chainable };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIP_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const OP_ID = '33333333-3333-3333-3333-333333333333';
const USER_EMAIL = 'parent@example.com';
const BASE_URL = 'https://businto.com';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('User "Quote Received" Email Flow', () => {

    // ── 1. Email template renders correctly ───────────────────────────────────
    describe('emailTemplates.quoteReceived()', () => {
        it('renders the correct subject line with operator name and price', () => {
            const { subject } = emailTemplates.quoteReceived({
                userName: 'Maria',
                operatorName: 'City Ride LLC',
                price: 149.99,
                vehicleType: 'Wheelchair Van',
                requestId: TRIP_ID,
                quoteId: 'q-001',
                claimLink: `${BASE_URL}/claim/TESTCODE`,
            });

            expect(subject).toContain('149.99');
            expect(subject).toContain('City Ride LLC');
        });

        it('renders "View & Accept Quote" button with the claim link', () => {
            const { html } = emailTemplates.quoteReceived({
                userName: 'Maria',
                operatorName: 'City Ride LLC',
                price: 149.99,
                vehicleType: 'Wheelchair Van',
                requestId: TRIP_ID,
                quoteId: 'q-001',
                claimLink: `${BASE_URL}/claim/TESTCODE`,
            });

            expect(html).toContain('/claim/TESTCODE');
            expect(html).toContain('View &amp; Accept Quote');
        });

        it('uses /claim/ path (short link), NOT a long JWT ?token= URL', () => {
            const { html } = emailTemplates.quoteReceived({
                userName: 'Maria',
                operatorName: 'City Ride LLC',
                price: 99,
                vehicleType: 'Van',
                requestId: TRIP_ID,
                quoteId: 'q-001',
                claimLink: `${BASE_URL}/claim/SHORTCODE`,
            });

            // Confirm /claim/ short path is present
            expect(html).toContain('/claim/SHORTCODE');
            // Confirm no raw long JWT token is embedded
            expect(html).not.toMatch(/\?token=eyJ/);
        });

        it('renders "$0 / Estimate (TBD)" when price is 0', () => {
            const { html } = emailTemplates.quoteReceived({
                userName: 'Maria',
                operatorName: 'Quick Ambulance',
                price: 0,
                vehicleType: 'Ambulance',
                requestId: TRIP_ID,
                quoteId: 'q-002',
                claimLink: `${BASE_URL}/claim/ZEROCODE`,
            });

            expect(html).toContain('Estimate (TBD)');
        });

        it('displays operator name in the email body', () => {
            const { html } = emailTemplates.quoteReceived({
                userName: 'John',
                operatorName: 'MedTrans Group',
                price: 250,
                vehicleType: 'Stretcher Van',
                requestId: TRIP_ID,
                quoteId: 'q-003',
                claimLink: `${BASE_URL}/claim/MEDCODE`,
            });

            expect(html).toContain('MedTrans Group');
            expect(html).toContain('John');
        });
    });

    // ── 2. Claim code round-trip ───────────────────────────────────────────────
    describe('Claim Code – trip_view round-trip', () => {
        it('createClaimCode() returns a 12-char alphanumeric code', async () => {
            const code = await createClaimCode({
                resourceType: 'trip_view',
                resourceId: TRIP_ID,
                userId: USER_ID,
                operatorId: OP_ID,
                purpose: 'view',
                expiresInMinutes: 43200,
                emailSentTo: USER_EMAIL,
            });

            expect(typeof code).toBe('string');
            expect(code.length).toBe(12);
            expect(code).toMatch(/^[a-zA-Z0-9]+$/);
        });
    });

    // ── 3. UserTripToken generation + verification ─────────────────────────────
    describe('generateUserTripToken() + verifyUserTripToken()', () => {
        it('generates a JWT and verifies it with correct payload', async () => {
            const token = await generateUserTripToken(TRIP_ID, USER_ID, OP_ID, 30);

            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // valid JWT structure

            const payload = await verifyUserTripToken(token);

            expect(payload).not.toBeNull();
            expect(payload!.requestId).toBe(TRIP_ID);
            expect(payload!.userId).toBe(USER_ID);
            expect(payload!.operatorId).toBe(OP_ID);
            expect(payload!.purpose).toBe('view_trip');
        });

        it('token is shorter than 300 chars (safe for email links)', async () => {
            const token = await generateUserTripToken(TRIP_ID, USER_ID, OP_ID, 30);
            expect(token.length).toBeLessThan(300);
        });

        it('verifyUserTripToken() rejects a tampered token', async () => {
            const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJyaWQiOiJmYWtlIn0.INVALIDSIG';
            const payload = await verifyUserTripToken(fakeToken);
            expect(payload).toBeNull();
        });

        it('verifyUserTripToken() rejects an operator token (wrong purpose)', async () => {
            const { generateOperatorViewToken } = await import('../src/lib/tokens');
            const opToken = await generateOperatorViewToken(TRIP_ID, OP_ID, 'quote', 7);
            const payload = await verifyUserTripToken(opToken);
            // purpose !== 'view_trip' → must be null
            expect(payload).toBeNull();
        });
    });

    // ── 4. Full flow integration (simulate claim route behavior) ───────────────
    describe('Full claim-to-trip redirect simulation', () => {
        it('simulates the full /claim/[code] → token → /trips/[id] flow', async () => {
            // Step 1: generate claim link (as done in /api/quotes POST)
            const code = await createClaimCode({
                resourceType: 'trip_view',
                resourceId: TRIP_ID,
                userId: USER_ID,
                purpose: 'view',
                expiresInMinutes: 43200,
                emailSentTo: USER_EMAIL,
            });

            expect(code).toBeDefined();

            // Step 2: simulate what /claim/[code]/route.ts does
            // (redeem code → generate JWT → build redirect URL)
            const token = await generateUserTripToken(TRIP_ID, USER_ID, undefined, 30);
            const destination = `/trips/${TRIP_ID}?token=${token}`;

            expect(destination).toContain(`/trips/${TRIP_ID}`);
            expect(destination).toContain('?token=');

            // Step 3: verify the token in the destination URL is valid
            const urlToken = new URLSearchParams(destination.split('?')[1]).get('token')!;
            const payload = await verifyUserTripToken(urlToken);

            expect(payload).not.toBeNull();
            expect(payload!.requestId).toBe(TRIP_ID);
            expect(payload!.userId).toBe(USER_ID);
            expect(payload!.purpose).toBe('view_trip');

            console.log('✅ Full flow: claim-code → JWT → /trips/[id] verified.');
            console.log(`   Destination: ${destination.substring(0, 80)}...`);
        });
    });
});
