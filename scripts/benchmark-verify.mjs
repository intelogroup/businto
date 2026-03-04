#!/usr/bin/env node
/**
 * Quick targeted benchmark — verifies performance of patched endpoints.
 * Run: node scripts/benchmark-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
    readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
} catch { }

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const N = 8;

const c = (color, s) => ({ reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m', cyan: '\x1b[36m', gray: '\x1b[90m' })[color] + s + '\x1b[0m';

function stats(t) {
    const s = [...t].sort((a, b) => a - b);
    return { avg: Math.round(t.reduce((a, b) => a + b, 0) / t.length), p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)] };
}

async function bench(label, fn, n = N) {
    const times = [];
    for (let i = 0; i < n; i++) {
        const t = Date.now();
        try { await fn(); } catch { }
        times.push(Date.now() - t);
        await new Promise(r => setTimeout(r, 50));
    }
    return { label, ...stats(times) };
}

function row(r, baseline) {
    const pct = baseline ? Math.round((1 - r.p95 / baseline) * 100) : null;
    const change = pct !== null ? (pct > 0 ? c('green', `↓${pct}% faster`) : c('red', `↑${Math.abs(pct)}% slower`)) : '';
    const flag = r.p95 >= 1000 ? '🔴' : r.p95 >= 500 ? '🟡' : '✅';
    console.log(`  ${flag} ${r.label.padEnd(58)} p50=${r.p50}ms  p95=${r.p95}ms  ${change}`);
}

async function main() {
    console.log('\n' + c('bold', c('cyan', '╔═══════════════════════════════════════════════════╗')));
    console.log(c('bold', c('cyan', '║    BUSINTO — POST-FIX VERIFICATION BENCHMARK     ║')));
    console.log(c('bold', c('cyan', '╚═══════════════════════════════════════════════════╝')));
    console.log(c('gray', `  ${new Date().toISOString()}\n`));

    // ─── API ────────────────────────────────────────────────────────────────────
    console.log(c('bold', '\n  📡 API Endpoints'));

    const r1 = await bench('GET /api/quotes (no filter, now paginated)', () =>
        fetch(`${BASE_URL}/api/quotes`));
    row(r1, 590); // baseline p95

    const r2 = await bench('POST /api/quotes (400 validation, now fire-forget logEvent)', () =>
        fetch(`${BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ total_price: 100 })
        }));
    row(r2, 214);

    const r3 = await bench('POST /api/requests (400 validation, fast-fail)', () =>
        fetch(`${BASE_URL}/api/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_type: 'school' })
        }));
    row(r3, 13);

    // ─── DB ─────────────────────────────────────────────────────────────────────
    if (supabase) {
        console.log(c('bold', '\n  🗄  DB Queries'));

        const d1 = await bench('app_settings lookup (first call — hits DB)', () =>
            supabase.from('app_settings').select('value').eq('key', 'manual_dispatch_mode').maybeSingle());
        row(d1, 143);

        // Simulate what app-settings.ts caching does (second call would be 0ms but we test DB path)
        const d2 = await bench('transport_request + profile JOIN (was 2 sequential calls)', () =>
            supabase.from('transport_requests')
                .select('user_id, metadata_private, userProfile:profiles!user_id(email, full_name)')
                .limit(1).maybeSingle());
        row(d2, 272);

        const d3 = await bench('quotes (no filter) paginated — limit 50', () =>
            supabase.from('quotes')
                .select('*, operator:operators(id, company_name, company_email, rating)')
                .order('created_at', { ascending: false })
                .range(0, 49));
        row(d3, 595);
    }

    console.log(c('gray', '\n  Baseline figures shown are pre-fix p95 from the initial benchmark.\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
