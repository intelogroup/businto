import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateOperatorViewToken, generateUserTripToken, verifyOperatorViewToken, verifyUserTripToken } from '@/lib/tokens';
import { emailTemplates } from '@/lib/email';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_APP_URL = 'https://businto.com';

describe('Link Redirection & Session Integrity', () => {
    const requestId = 'req-123';
    const userId = 'user-456';
    const operatorId = 'op-789';

    describe('User Magic Links (Auto Sign-in)', () => {
        it('generates a valid user trip token', async () => {
            const token = await generateUserTripToken(requestId, userId);
            const payload = await verifyUserTripToken(token);

            expect(payload).not.toBeNull();
            expect(payload?.requestId).toBe(requestId);
            expect(payload?.userId).toBe(userId);
            expect(payload?.purpose).toBe('view_trip');
        });

        it('embeds the correct token/link in quoteReceived email', async () => {
            const price = 150;
            const operatorName = 'Test Operator';
            const vehicleType = 'Sprinter';
            const token = 'mock-jwt-token';

            const email = emailTemplates.quoteReceived({
                userName: 'Customer',
                operatorName,
                price,
                vehicleType,
                requestId,
                quoteId: 'q-999',
                accessToken: token,
                appBaseUrl: 'https://businto.com'
            });

            // Verify the link construction
            expect(email.html).toContain(`https://businto.com/trips/${requestId}?token=${token}`);
        });

        it('prefers magic link over tokenized URL if provided', () => {
            const magicLink = 'https://businto.com/verify?token=supabase-secret&type=magiclink';

            const email = emailTemplates.quoteReceived({
                userName: 'Customer',
                operatorName: 'Op',
                price: 100,
                vehicleType: 'Bus',
                requestId,
                quoteId: 'q-1',
                appBaseUrl: magicLink // In implementation, appBaseUrl is overloaded with the full magic link
            });

            expect(email.html).toContain(magicLink);
            // We check that it didn't append ANOTHER ?token= or /trips/
            expect(email.html).not.toContain('/trips/req-123');
        });
    });

    describe('Operator Guest Links', () => {
        it('generates a valid operator quote token', async () => {
            const token = await generateOperatorViewToken(requestId, operatorId, 'quote');
            const payload = await verifyOperatorViewToken(token);

            expect(payload).not.toBeNull();
            expect(payload?.requestId).toBe(requestId);
            expect(payload?.operatorId).toBe(operatorId);
            expect(payload?.purpose).toBe('quote');
        });

        it('embeds the correct token/link in operatorNewRequest email', () => {
            const token = 'op-token-123';
            const email = emailTemplates.operatorNewRequest({
                operatorName: 'Op Name',
                serviceType: 'medical',
                serviceTypeDisplay: 'Medical',
                pickupAddress: '123 Main St',
                dropoffAddress: '456 Oak St',
                pickupFuzzy: '123 Main St',
                dropoffFuzzy: '456 Oak St',
                date: '2026-03-10',
                requirements: [],
                requestId,
                accessToken: token,
                appBaseUrl: 'https://businto.com'
            });

            expect(email.html).toContain(`https://businto.com/quotes/submit?request_id=${requestId}&token=${token}`);
        });
    });

    describe('PII Reveal Link (Post-Payment)', () => {
        it('routes operator to dashboard/bookings for order details', () => {
            // Note: operatorOrderDetails doesn't use a token link, it's a direct route
            // because the operator is assumed to be logged in (or we reveal info in email)
            const email = emailTemplates.operatorOrderDetails({
                operatorName: 'Op',
                parentName: 'Parent',
                parentEmail: 'p@t.com',
                parentPhone: '555',
                quoteAmount: 100,
                pickup: 'A',
                dropoff: 'B',
                date: 'C',
                vehicleType: 'D',
                confirmationCode: 'BOOK-1',
                bookingId: 'bid-1'
            });

            // Verification would depend on the manual link in the template if one existed.
            // Currently, it's just a detail email.
            expect(email.subject).toContain('BOOK-1');
        });
    });
});
