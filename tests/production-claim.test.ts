import { describe, it, expect } from 'vitest';
import { createClaimCode } from '@/lib/claim-codes';

describe('Production Claim Flow (HTTP)', () => {
    it('should redirect correctly when redeeming a live code', async () => {
        // 1. Create a claim code (hits DB directly via supabaseAdmin)
        const code = await createClaimCode({
            resourceType: 'operator_quote',
            resourceId: '00000000-0000-0000-0000-000000000010',
            operatorId: '00000000-0000-0000-0000-000000000011',
            purpose: 'quote',
            expiresInMinutes: 5
        });

        expect(code).toBeDefined();

        // 2. Hit the production endpoint via HTTP
        const PRODUCTION_URL = 'https://businto.com';
        const claimUrl = `${PRODUCTION_URL}/claim/${code}`;

        console.log(`🔗 Testing HTTP Claim at: ${claimUrl}`);

        const response = await fetch(claimUrl, {
            method: 'GET',
            redirect: 'manual'
        });

        // It should be a redirect (307 or 302)
        expect(response.status).toBeGreaterThanOrEqual(300);
        expect(response.status).toBeLessThan(400);

        const location = response.headers.get('location');
        expect(location).toContain('/quotes/submit');
        expect(location).toContain('token=');

        console.log('✅ Production HTTP flow verified. Redirected to:', location);
    });
});
