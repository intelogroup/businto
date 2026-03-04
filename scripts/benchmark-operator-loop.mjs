#!/usr/bin/env node
/**
 * Operator Loop Concurrency Benchmark
 * ======================================
 * Measures the wall-clock cost of the serial per-operator loop in
 * POST /api/requests vs a Promise.all parallel equivalent.
 *
 * Simulates 3 units of work per operator (matching the actual hot path):
 *   1. generateOperatorQuoteLink  → DB read (email_claim_codes SELECT/INSERT)
 *   2. sendEmail                  → Resend API HTTP call (mocked here as fake latency)
 *   3. notifications INSERT       → DB write
 *
 * In real production, steps 1–3 happen sequentially inside a for-loop.
 * This benchmark quantifies the gain from parallelising them with Promise.all.
 *
 * Usage:
 *   node scripts/benchmark-operator-loop.mjs
 *   MOCK_EMAIL_MS=150 node scripts/benchmark-operator-loop.mjs
 *   REAL_DB=1 node scripts/benchmark-operator-loop.mjs          # uses Supabase
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
} catch { /* ignore */ }

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_REAL_DB = process.env.REAL_DB === '1' && SUPABASE_URL && SUPABASE_KEY;

// Simulated latencies (milliseconds) per operation — tuned to match real observations
const MOCK_CLAIM_CODE_DB_MS  = parseInt(process.env.MOCK_CLAIM_CODE_MS  || '45',  10); // claim code DB round-trip
const MOCK_EMAIL_API_MS      = parseInt(process.env.MOCK_EMAIL_MS       || '180', 10); // Resend API call
const MOCK_NOTIFICATION_DB_MS= parseInt(process.env.MOCK_NOTIF_MS       || '35',  10); // notification INSERT

const ITERS = parseInt(process.env.ITERS || '6', 10);
const OPERATOR_COUNTS = [1, 2, 3, 5, 7];

const supabase = USE_REAL_DB ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const A = { reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const c = (col, s) => A[col] + s + A.reset;

function percentile(sorted, p) {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || 0;
}
function stats(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return {
        min: s[0] || 0, max: s[s.length - 1] || 0,
        avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
        p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99)
    };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms + Math.random() * 10)); }

// ─── Simulated per-operator work units ───────────────────────────────────────

/** Mock: simulate one operator's full email notification path */
async function mockPerOperator(_op) {
    await sleep(MOCK_CLAIM_CODE_DB_MS);   // claim code DB lookup / insert
    await sleep(MOCK_EMAIL_API_MS);       // Resend API HTTP call
    await sleep(MOCK_NOTIFICATION_DB_MS); // in-app notification INSERT
}

/** Real DB: run actual Supabase queries to measure true network latency */
async function realPerOperator(op) {
    // Simulates: generateOperatorQuoteLink (claim code lookup)
    await supabase.from('email_claim_codes')
        .select('id, code').eq('operator_id', op.id).limit(1);
    // Simulates: notification INSERT (read proxy)
    if (op.profile_id) {
        await supabase.from('notifications').select('id').eq('user_id', op.profile_id).limit(1);
    }
    // Note: actual Resend API not called — that's a live HTTP side effect
    await sleep(MOCK_EMAIL_API_MS); // still simulate email API latency
}

const perOperator = supabase ? realPerOperator : mockPerOperator;

// ─── Benchmark runner ─────────────────────────────────────────────────────────

async function runForCount(operators, count) {
    const ops = operators.slice(0, count);
    const serialTimes = [];
    const parallelTimes = [];

    for (let i = 0; i < ITERS; i++) {
        // SERIAL: for-await loop (current production pattern)
        const t0 = Date.now();
        for (const op of ops) await perOperator(op);
        serialTimes.push(Date.now() - t0);

        await sleep(20);

        // PARALLEL: Promise.all (proposed optimisation)
        const t1 = Date.now();
        await Promise.all(ops.map(perOperator));
        parallelTimes.push(Date.now() - t1);

        await sleep(20);
    }

    return { serial: stats(serialTimes), parallel: stats(parallelTimes) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + c('bold', c('cyan', '╔══════════════════════════════════════════════════════════╗')));
    console.log(c('bold', c('cyan', '║   BUSINTO — OPERATOR LOOP SERIAL vs PARALLEL BENCHMARK  ║')));
    console.log(c('bold', c('cyan', '╚══════════════════════════════════════════════════════════╝')));
    console.log(c('gray', `  Mode:        ${supabase ? 'REAL DB (Supabase)' : 'MOCK (simulated latency)'}`));
    console.log(c('gray', `  Simulated latencies: claim_code=${MOCK_CLAIM_CODE_DB_MS}ms  email_api=${MOCK_EMAIL_API_MS}ms  notification=${MOCK_NOTIFICATION_DB_MS}ms`));
    console.log(c('gray', `  Per-operator total (mock): ~${MOCK_CLAIM_CODE_DB_MS + MOCK_EMAIL_API_MS + MOCK_NOTIFICATION_DB_MS}ms`));
    console.log(c('gray', `  Iterations: ${ITERS}  |  ${new Date().toISOString()}\n`));

    // Get real or mock operators
    let operators;
    if (supabase) {
        const { data } = await supabase.from('operators')
            .select('id, profile_id, company_email')
            .eq('is_verified', true).eq('is_active', true).limit(10);
        operators = data || [];
        if (operators.length === 0) {
            console.log(c('yellow', '  ⚠ No verified operators in DB — falling back to mock'));
            operators = Array.from({ length: 7 }, (_, i) => ({ id: `mock-${i}`, profile_id: `mock-profile-${i}`, company_email: `mock${i}@test.com` }));
        }
    } else {
        operators = Array.from({ length: 7 }, (_, i) => ({ id: `mock-${i}`, profile_id: null, company_email: `mock${i}@test.com` }));
    }

    console.log(c('bold', '\n  Operator Count    │  Serial p50/p95   │  Parallel p50/p95  │  Speedup  │  Ops/sec (parallel)'));
    console.log('  ' + '─'.repeat(95));

    const report = [];

    for (const count of OPERATOR_COUNTS) {
        if (count > operators.length) {
            console.log(c('gray', `  (skipping count=${count} — only ${operators.length} operators available)`));
            continue;
        }

        const { serial, parallel } = await runForCount(operators, count);
        const speedup = (serial.p95 / Math.max(parallel.p95, 1)).toFixed(2);
        const opsPerSecParallel = count > 0 ? (1000 / parallel.p95 * count).toFixed(1) : 0;
        const theoreticalParallelP95 = MOCK_CLAIM_CODE_DB_MS + MOCK_EMAIL_API_MS + MOCK_NOTIFICATION_DB_MS + Math.round(10 * Math.log(count + 1));
        const overhead = parallel.p95 - (supabase ? 0 : theoreticalParallelP95);

        const speedupColor = parseFloat(speedup) >= 3 ? 'green' : parseFloat(speedup) >= 2 ? 'yellow' : 'red';

        console.log(
            `  ${String(count).padEnd(18)}│  ${String(serial.p50).padEnd(6)}/ ${String(serial.p95).padEnd(7)} │  ${String(parallel.p50).padEnd(7)}/ ${String(parallel.p95).padEnd(8)} │  ${c(speedupColor, `${speedup}x`).padEnd(20)} │  ${opsPerSecParallel} ops/s`
        );

        report.push({ count, serial, parallel, speedup: parseFloat(speedup) });
    }

    console.log('\n' + c('bold', '  📊 ANALYSIS'));
    console.log(c('gray', '  ─────────────────────────────────────────────────────────────────────────────────────'));

    const worst = report[report.length - 1];
    if (worst) {
        const savedMs = worst.serial.p95 - worst.parallel.p95;
        console.log(`  At ${worst.count} operators (production max):`);
        console.log(`    Serial p95:   ${c('red', worst.serial.p95 + 'ms')}  (current production — blocks HTTP response)`);
        console.log(`    Parallel p95: ${c('green', worst.parallel.p95 + 'ms')}  (Promise.all proposal)`);
        console.log(`    Time saved:   ${c('green', savedMs + 'ms')}  (${Math.round(savedMs / worst.serial.p95 * 100)}% reduction at max concurrency)`);
    }

    console.log(c('gray', '\n  NOTE: Real-world savings are larger because email API calls (~180ms each) dominate serial cost.'));
    console.log(c('gray', '  Moving to Promise.all turns N×(180ms) → ~180ms regardless of operator count.\n'));
    console.log(c('bold', c('cyan', '  Done.\n')));
}

main().catch(err => { console.error(c('red', '\n  Fatal error:'), err); process.exit(1); });
