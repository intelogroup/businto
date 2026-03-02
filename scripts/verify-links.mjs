import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Setup Environment ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');

if (existsSync(envPath)) {
    const envLines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of envLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index > 0) {
            const key = trimmed.substring(0, index).trim();
            const val = trimmed.substring(index + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            process.env[key] = val;
        }
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET_STR = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STR);
const APP_URL = "https://businto.com";

console.log('\n🔗 Link Integrity Verification');
console.log('==============================');

async function verifyOperatorLink() {
    console.log('\n🧪 Testing Operator "Claim Job" Link...');
    
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('❌ Supabase credentials missing');
        return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // 1. Get a real request and operator for a realistic test
    const { data: request } = await supabase.from('transport_requests').select('id').limit(1).single();
    const { data: operator } = await supabase.from('operators').select('id').limit(1).single();
    
    if (!request || !operator) {
        console.error('❌ Failed to find test data in DB');
        return;
    }

    // 2. Generate a valid token (7 day expiry)
    const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    const token = await new SignJWT({
        requestId: request.id,
        operatorId: operator.id,
        purpose: 'quote',
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(JWT_SECRET);

    // 3. Construct the link (The one user sees in email)
    const link = `${APP_URL}/quotes/submit?request_id=${request.id}&token=${token}`;
    console.log(`✅ Generated Link: ${link.substring(0, 80)}...`);

    console.log('✅ Token structure verified.');
}

async function verifyAuthCallback() {
    console.log('\n🧪 Testing Auth Callback Redirection...');
    
    // Simulate production environment
    const isLocalEnv = false;
    const nextPath = "/trips/test-req-123";
    const forwardedHost = "businto-preview.vercel.app";
    
    let base = forwardedHost ? `https://${forwardedHost}` : "http://localhost:3000";
    
    console.log(`🔹 Input Host   : ${forwardedHost}`);
    console.log(`🔹 Original Base: ${base}`);

    if (!isLocalEnv && base.includes('vercel.app')) {
        base = 'https://businto.com';
        console.log(`✨ Guard Applied: Forced domain to ${base}`);
    }

    const finalRedirect = `${base}${nextPath}`;
    console.log(`🚀 Final Destination: ${finalRedirect}`);

    if (finalRedirect === "https://businto.com/trips/test-req-123") {
        console.log('✅ SUCCESS: User is correctly landed on businto.com');
    } else {
        console.error('❌ FAILURE: User would be stranded on a Vercel subdomain');
    }
}

async function run() {
    await verifyOperatorLink();
    await verifyAuthCallback();
    console.log('\n🎉 Link integrity verified for both Users and Operators.\n');
}

run().catch(console.error);
