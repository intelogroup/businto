import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe('Database Security - RLS Enforcement', () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    it('CRITICAL: Anonymous users should NOT be able to SELECT transport_requests', async () => {
        const { data, error } = await supabase
            .from('transport_requests')
            .select('*');

        // After hardening, this should return an empty array if RLS is permissive but filters,
        // or a 425/403 if the policy is dropped and no other policy matches.
        // In Supabase, if no SELECT policy matches, it returns empty data with no error,
        // OR it might return an error if we explicitly revoked usage (not done here yet).

        if (error) {
            // Error is acceptable as long as it's not successful data retrieval
            return;
        }

        expect(data).toHaveLength(0);
    });

    it('SHOULD allow anonymous INSERT to transport_requests (for public forms)', async () => {
        // Test insertion of a dummy request to ensure public form still works
        const dummyId = crypto.randomUUID();
        const { error } = await supabase
            .from('transport_requests')
            .insert({
                id: dummyId,
                service_type: 'medical',
                pickup_fuzzy: 'Test Location',
                dropoff_fuzzy: 'Test Destination',
                pickup_address: '123 Test St',
                dropoff_address: '456 Lab Rd',
                start_date: '2099-01-01',
                status: 'pending'
            });

        // This should NOT fail if our anon_insert_requests_v2 is correct
        // Note: Clean up if necessary, but this is a local test env
        expect(error).toBeNull();

        // Immediately verify we CANNOT read it back even if we just inserted it
        const { data: readBack } = await supabase
            .from('transport_requests')
            .select('*')
            .eq('id', dummyId);

        expect(readBack).toHaveLength(0);

        // Cleanup
        // (Anon can't delete, so we'd need an admin client to clean up if this was persistent)
    });
});
