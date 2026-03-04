#!/usr/bin/env node
/**
 * Businto Performance Benchmark Suite
 * =====================================
 * Profiles all major API endpoints against a running local dev server.
 * Measures: p50/p95/p99 latencies, identifies sequential DB query bottlenecks.
 *
 * Usage:
 *   node scripts/benchmark.mjs                  # runs against localhost:3000
 *   BASE_URL=https://businto.com node scripts/benchmark.mjs  # remote (careful!)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

// Load .env.local manually (no dotenv dep required)
const env = {};
try {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    });
} catch { /* file might not exist */ }

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ⚠️  Safety guard: never run destructive/noisy benchmarks against production
const PRODUCTION_HOSTS = ['businto.com', 'www.businto.com'];
const parsedBase = new URL(BASE_URL);
if (PRODUCTION_HOSTS.includes(parsedBase.hostname)) {
    console.error(
        `\n🚫  BLOCKED: Benchmark script refuses to run against production host "${parsedBase.hostname}".\n` +
        `    Use a local dev server: BASE_URL=http://localhost:3000 node scripts/benchmark.mjs\n`
    );
    process.exit(1);
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ITERATIONS = parseInt(process.env.ITERATIONS || '10', 10);

const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ANSI = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, str) => ANSI[color] + str + ANSI.reset;

function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function stats(timings) {
    const sorted = [...timings].sort((a, b) => a - b);
    return {
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0,
        avg: Math.round(timings.reduce((s, t) => s + t, 0) / timings.length),
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
    };
}

function latencyLabel(ms) {
    if (ms < 200) return c('green', `${ms}ms`);
    if (ms < 500) return c('yellow', `${ms}ms`);
    if (ms < 1000) return c('yellow', `${ms}ms ⚠`);
    return c('red', `${ms}ms 🔴`);
}

async function timedFetch(label, fn, n = ITERATIONS) {
    const timings = [];
    let errors = 0;
    let lastStatus = 0;

    for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        try {
            const res = await fn();
            lastStatus = res.status;
            if (res.status >= 500) errors++;
        } catch {
            errors++;
        }
        timings.push(Date.now() - t0);
        // Small jitter between requests
        await new Promise(r => setTimeout(r, 50));
    }

    const s = stats(timings);
    return { label, ...s, errors, lastStatus, n };
}

async function timedDB(label, fn, n = ITERATIONS) {
    const timings = [];
    let errors = 0;

    for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        try {
            await fn();
        } catch {
            errors++;
        }
        timings.push(Date.now() - t0);
        await new Promise(r => setTimeout(r, 30));
    }

    const s = stats(timings);
    return { label, ...s, errors, n };
}

function printRow(r) {
    const ident = r.lastStatus ? `[${r.lastStatus}]` : '[DB]';
    console.log(
        `  ${c('bold', ident.padEnd(6))} ${r.label.padEnd(52)} ` +
        `p50=${latencyLabel(r.p50).padEnd(20)} ` +
        `p95=${latencyLabel(r.p95).padEnd(20)} ` +
        `p99=${latencyLabel(r.p99).padEnd(20)} ` +
        `min=${r.min}ms max=${r.max}ms` +
        (r.errors ? c('red', `  errors=${r.errors}`) : '')
    );
}

function section(title) {
    console.log('\n' + c('blue', '═'.repeat(100)));
    console.log(c('bold', c('cyan', `  ${title}`)));
    console.log(c('blue', '─'.repeat(100)));
}

// ─── Test Data Resolution ─────────────────────────────────────────────────────
async function resolveTestData() {
    if (!supabase) return {};

    const { data: requests } = await supabase
        .from('transport_requests').select('id, user_id, status').limit(5);
    const { data: quotes } = await supabase
        .from('quotes').select('id, request_id, operator_id, status').limit(5);
    const { data: operators } = await supabase
        .from('operators').select('id').limit(3);
    const { data: bookings } = await supabase
        .from('bookings').select('id').limit(3);

    return {
        sampleRequestId: requests?.[0]?.id,
        sampleUserId: requests?.[0]?.user_id,
        sampleQuoteId: quotes?.[0]?.id,
        sampleOperatorId: operators?.[0]?.id,
        sampleBookingId: bookings?.[0]?.id,
    };
}

// ─── Benchmark Groups ─────────────────────────────────────────────────────────

async function benchApiEndpoints(td) {
    section('📡 API Endpoint Latency Benchmarks');

    const results = [];

    // 1. Health / basic endpoints
    results.push(await timedFetch('GET / (homepage HTML)', () => fetch(BASE_URL + '/')));

    // 2. Quotes GET
    results.push(await timedFetch(
        'GET /api/quotes (no filter)',
        () => fetch(BASE_URL + '/api/quotes')
    ));

    if (td.sampleRequestId) {
        results.push(await timedFetch(
            `GET /api/quotes?request_id=<id>`,
            () => fetch(`${BASE_URL}/api/quotes?request_id=${td.sampleRequestId}`)
        ));
    }

    if (td.sampleOperatorId) {
        results.push(await timedFetch(
            `GET /api/quotes?operator_id=<id>`,
            () => fetch(`${BASE_URL}/api/quotes?operator_id=${td.sampleOperatorId}`)
        ));
    }

    // 3. Requests GET (auth-gated — expect 200 or 401)
    results.push(await timedFetch(
        'GET /api/requests (unauthenticated → empty array)',
        () => fetch(BASE_URL + '/api/requests')
    ));

    // 4. Geocode proxy (external latency leak)
    results.push(await timedFetch(
        'GET /api/geocode?q=Boston,MA',
        () => fetch(`${BASE_URL}/api/geocode?q=${encodeURIComponent('Boston, MA')}&limit=1`),
        5
    ));

    // 5. Log endpoint
    results.push(await timedFetch(
        'GET /api/logs',
        () => fetch(BASE_URL + '/api/logs')
    ));

    // 6. Claim code endpoint (requires valid code, so we test 404 path)
    results.push(await timedFetch(
        'GET /claim/BENCHMARK_TEST (expected 404 redirect)',
        () => fetch(`${BASE_URL}/claim/BENCHMARK_TEST`, { redirect: 'manual' })
    ));

    // 7. Simulated POST /api/requests (incomplete payload → 400 fast-fail)
    results.push(await timedFetch(
        'POST /api/requests (400 fast-fail validation)',
        () => fetch(BASE_URL + '/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-benchmark-test': '1' },
            body: JSON.stringify({ service_type: 'school' }) // missing required fields
        }),
        5
    ));

    // 8. POST /api/quotes (incomplete → 400)
    results.push(await timedFetch(
        'POST /api/quotes (400 fast-fail validation)',
        () => fetch(BASE_URL + '/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-benchmark-test': '1' },
            body: JSON.stringify({ total_price: 100 })
        }),
        5
    ));

    results.forEach(printRow);
    return results;
}

async function benchDatabaseQueries() {
    if (!supabase) {
        console.log(c('yellow', '\n  ⚠ Skipping DB benchmarks (no Supabase credentials)'));
        return [];
    }

    section('🗄  Direct Supabase Query Benchmarks');

    const results = [];

    // 1. Simple single-table selects
    results.push(await timedDB(
        'SELECT operators (is_verified + is_active + is_accepting)',
        () => supabase.from('operators')
            .select('id, company_name, rating, service_areas, vehicle_types, specialties')
            .eq('is_verified', true).eq('is_active', true).eq('is_accepting_requests', true)
    ));

    results.push(await timedDB(
        'SELECT transport_requests ORDER BY created_at DESC LIMIT 20',
        () => supabase.from('transport_requests')
            .select('id, service_type, pickup_fuzzy, dropoff_fuzzy, status, created_at')
            .order('created_at', { ascending: false })
            .limit(20)
    ));

    results.push(await timedDB(
        'SELECT quotes with nested operator join',
        () => supabase.from('quotes')
            .select('*, operator:operators(id, company_name, company_email, rating)')
            .order('created_at', { ascending: false })
            .limit(20)
    ));

    results.push(await timedDB(
        'SELECT quotes with operator + request join (GET /api/quotes)',
        () => supabase.from('quotes').select(`
        *,
        operator:operators (id, company_name, company_email, company_phone, rating),
        request:transport_requests (id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, status)
      `).order('created_at', { ascending: false }).limit(10)
    ));

    // 2. Filtered queries
    results.push(await timedDB(
        'SELECT app_settings WHERE key=manual_dispatch_mode',
        () => supabase.from('app_settings').select('value').eq('key', 'manual_dispatch_mode').maybeSingle()
    ));

    results.push(await timedDB(
        'SELECT notifications ORDER BY created_at DESC LIMIT 10',
        () => supabase.from('notifications')
            .select('*').order('created_at', { ascending: false }).limit(10)
    ));

    results.push(await timedDB(
        'SELECT profiles (single latest)',
        () => supabase.from('profiles').select('id, email, full_name').limit(1)
    ));

    results.push(await timedDB(
        'SELECT bookings with nested joins',
        () => supabase.from('bookings').select(`
        *, 
        quote:quotes(*, operator:operators(company_name, company_email)),
        request:transport_requests(pickup_fuzzy, dropoff_fuzzy, start_date)
      `).limit(5)
    ));

    // 3. Pattern: Sequential queries (simulated — measures round-trip overhead)
    results.push(await timedDB(
        'SEQUENTIAL: request → profile (simulates POST /api/quotes pattern)',
        async () => {
            const { data: req } = await supabase.from('transport_requests')
                .select('user_id').limit(1).maybeSingle();
            if (req?.user_id) {
                await supabase.from('profiles')
                    .select('email, full_name').eq('id', req.user_id).single();
            }
        }
    ));

    results.push(await timedDB(
        'SEQUENTIAL: check accepted quote → check dup → insert (accept flow)',
        async () => {
            const { data: req } = await supabase.from('transport_requests')
                .select('id').eq('status', 'quoted').limit(1).maybeSingle();
            if (req?.id) {
                await supabase.from('quotes').select('id').eq('request_id', req.id).eq('status', 'accepted').maybeSingle();
                await supabase.from('quotes').select('id, status').eq('request_id', req.id).limit(5);
            }
        }
    ));

    // 4. N+1 simulation — operator matching: fetch operators then loop
    results.push(await timedDB(
        'N+1 SIMULATION: operator match + per-operator profile lookup',
        async () => {
            const { data: ops } = await supabase.from('operators')
                .select('id, profile_id').eq('is_verified', true).limit(5);
            if (ops) {
                await Promise.all(ops.map(op =>
                    op.profile_id
                        ? supabase.from('operator_profiles').select('full_name').eq('id', op.profile_id).single()
                        : Promise.resolve(null)
                ));
            }
        }
    ));

    results.push(await timedDB(
        'PARALLEL alternative: single join (operators + operator_profiles)',
        () => supabase.from('operators').select(`
        id, profile_id, company_name,
        profile:operator_profiles!profile_id(full_name, avatar_url)
      `).eq('is_verified', true).limit(5)
    ));

    results.forEach(printRow);
    return results;
}

async function benchOperatorMatching(td) {
    section('🔍 Operator Matching Pipeline Benchmarks');

    const results = [];

    if (!supabase) {
        console.log(c('yellow', '  ⚠ Skipping (no Supabase credentials)'));
        return results;
    }

    // Full matching pipeline simulation (what POST /api/requests calls)
    results.push(await timedDB(
        'Full operator query (school, MA, verified)',
        () => supabase.from('operators').select(`
        id, profile_id, company_name, company_email, company_phone,
        rating, service_areas, vehicle_types, specialties,
        base_rate_per_mile, company_lat, company_lng,
        service_radius_miles, response_time_avg_mins, acceptance_rate,
        active_quotes_count, is_partner
      `)
            .eq('is_verified', true).eq('is_active', true).eq('is_accepting_requests', true)
            .contains('service_areas', ['MA'])
            .contains('specialties', ['School Routes']),
        5
    ));

    results.push(await timedDB(
        'Full operator query (medical, no state filter)',
        () => supabase.from('operators').select(`
        id, profile_id, company_name, company_email, company_phone,
        rating, service_areas, vehicle_types, specialties,
        base_rate_per_mile, company_lat, company_lng,
        service_radius_miles, response_time_avg_mins, acceptance_rate,
        active_quotes_count, is_partner
      `)
            .eq('is_verified', true).eq('is_active', true).eq('is_accepting_requests', true)
            .contains('specialties', ['Medical Transport']),
        5
    ));

    results.forEach(printRow);
    return results;
}

async function benchCriticalPaths() {
    section('⚡ Critical Path: POST /api/requests (Full Simulation)');

    // This simulates the N-step waterfall in POST /api/requests
    // WITHOUT email/SMS to isolate DB cost

    if (!supabase) {
        console.log(c('yellow', '  ⚠ Skipping (no Supabase credentials)'));
        return [];
    }

    const steps = [];

    const ITERS = 5;
    let stepTimings = { auth: [], dispatch_check: [], operator_query: [], insert: [], logEvent: [] };

    for (let i = 0; i < ITERS; i++) {
        // Step 1: dispatch mode check
        let t = Date.now();
        await supabase.from('app_settings').select('value').eq('key', 'manual_dispatch_mode').maybeSingle();
        stepTimings.dispatch_check.push(Date.now() - t);

        // Step 2: operator query
        t = Date.now();
        await supabase.from('operators').select('id, company_name, company_email, specialties, vehicle_types, service_areas')
            .eq('is_verified', true).eq('is_active', true).eq('is_accepting_requests', true);
        stepTimings.operator_query.push(Date.now() - t);

        // Step 3: Insert transport_request
        t = Date.now();
        const { data: inserted, error } = await supabase.from('transport_requests').insert({
            service_type: 'school',
            pickup_address: '123 Benchmark Ln, Boston, MA',
            dropoff_address: '456 Test Ave, Cambridge, MA',
            pickup_fuzzy: 'Boston',
            dropoff_fuzzy: 'Cambridge',
            start_date: '2026-09-01',
            metadata_safe: { test: true },
            metadata_private: {},
            metadata: {},
            status: 'pending',
            payment_status: 'pending',
            routing_fee_amount: 1.99
        }).select().single();
        stepTimings.insert.push(Date.now() - t);

        // Step 4: logEvent (insert to event_logs)
        if (inserted?.id) {
            t = Date.now();
            await supabase.from('event_logs').insert({
                event_type: 'benchmark.test',
                actor_type: 'system',
                request_id: inserted.id,
                metadata: { benchmark: true }
            });
            stepTimings.logEvent.push(Date.now() - t);

            // Cleanup: delete the benchmark row
            await supabase.from('transport_requests').delete().eq('id', inserted.id);
        }
    }

    const labels = [
        ['dispatch_check', 'DB: app_settings (manual_dispatch_mode check)'],
        ['operator_query', 'DB: operators full match query'],
        ['insert', 'DB: INSERT transport_request'],
        ['logEvent', 'DB: INSERT event_log'],
    ];

    for (const [key, label] of labels) {
        const s = stats(stepTimings[key]);
        const r = { label, ...s, errors: 0, lastStatus: 0, n: ITERS };
        printRow(r);
        steps.push(r);
    }

    // Aggregate: what does the user WAIT for at minimum?
    const worstCase = labels.reduce((sum, [key]) => {
        return sum + stats(stepTimings[key]).p95;
    }, 0);

    console.log(c('yellow', `\n  ⏱  Estimated minimum API latency (sum of p95 DB steps): ${worstCase}ms`));
    console.log(c('gray', '     (excludes geocoding, email send, SMS, Stripe — those add more)'));

    return steps;
}

// ─── Quote Accept Waterfall ───────────────────────────────────────────────────
async function benchQuoteAcceptWaterfall() {
    section('🤝 Critical Path: POST /api/quotes/accept (Waterfall Simulation)');

    if (!supabase) {
        console.log(c('yellow', '  ⚠ Skipping (no Supabase credentials)'));
        return [];
    }

    const ITERS = 5;
    const steps = {};
    const labels = [
        ['verify_request_status', 'DB: transport_requests status check (race guard)'],
        ['fetch_quote_with_operator', 'DB: quotes + operator JOIN (accept details)'],
        ['fetch_request_with_profile', 'DB: transport_request + profiles JOIN (merged)'],
        ['update_accepted_quote', 'DB: UPDATE quotes SET status=accepted'],
        ['decline_other_quotes', 'DB: UPDATE quotes SET status=declined (batch)'],
        ['insert_booking', 'DB: INSERT bookings'],
    ];
    for (const [key] of labels) steps[key] = [];

    // Fetch one sample request and quote that we can use without mutating real data
    const { data: sampleRequest } = await supabase
        .from('transport_requests').select('id, status, user_id').limit(1).maybeSingle();
    const { data: sampleQuote } = await supabase
        .from('quotes').select('id, request_id, operator_id').limit(1).maybeSingle();

    for (let i = 0; i < ITERS; i++) {
        let t;

        // Step 1: Request status verification
        t = Date.now();
        if (sampleRequest?.id) {
            await supabase.from('transport_requests')
                .select('status, user_id, metadata_private').eq('id', sampleRequest.id).single();
        }
        steps.verify_request_status.push(Date.now() - t);

        // Step 2: Quote with operator JOIN
        t = Date.now();
        if (sampleQuote?.id) {
            await supabase.from('quotes').select(`
                *, operator:operators (
                    id, company_name, company_email, company_phone,
                    profile:operator_profiles!profile_id(full_name, avatar_url)
                )
            `).eq('id', sampleQuote.id).single();
        }
        steps.fetch_quote_with_operator.push(Date.now() - t);

        // Step 3: Transport request + user profile JOIN (was two sequential queries)
        t = Date.now();
        if (sampleRequest?.id) {
            await supabase.from('transport_requests')
                .select('*, userProfile:profiles!user_id(email, full_name, phone)')
                .eq('id', sampleRequest.id).single();
        }
        steps.fetch_request_with_profile.push(Date.now() - t);

        // Step 4: UPDATE accepted quote (simulate without committing)
        t = Date.now();
        if (sampleQuote?.id) {
            // Read-only proxy: we SELECT with .eq to measure query planner cost without mutation
            await supabase.from('quotes').select('id, status').eq('id', sampleQuote.id).single();
        }
        steps.update_accepted_quote.push(Date.now() - t);

        // Step 5: Decline other quotes (SELECT simulates the .neq filter scan)
        t = Date.now();
        if (sampleRequest?.id) {
            await supabase.from('quotes').select('operator_id')
                .eq('request_id', sampleRequest.id)
                .neq('id', sampleQuote?.id || 'none');
        }
        steps.decline_other_quotes.push(Date.now() - t);

        // Step 6: INSERT booking (simulate with SELECT on bookings table to measure baseline cost)
        t = Date.now();
        await supabase.from('bookings').select('id').limit(1);
        steps.insert_booking.push(Date.now() - t);

        await new Promise(r => setTimeout(r, 30));
    }

    const results = [];
    for (const [key, label] of labels) {
        const s = stats(steps[key]);
        const r = { label, ...s, errors: 0, lastStatus: 0, n: ITERS };
        printRow(r);
        results.push(r);
    }

    const waterfallP95 = labels.reduce((sum, [key]) => sum + stats(steps[key]).p95, 0);
    console.log(c('yellow', `\n  ⏱  Estimated accept waterfall DB cost (sum of p95 steps): ${waterfallP95}ms`));
    console.log(c('gray', '     (excludes: email notifications, SMS, in-app notifications, booking INSERT latency)'));

    return results;
}

// ─── Serial vs Parallel Operator Loop ────────────────────────────────────────
async function benchOperatorLoopConcurrency() {
    section('⚙️  Serial vs Parallel Operator Loop (per-operator email/DB pattern)');

    if (!supabase) {
        console.log(c('yellow', '  ⚠ Skipping (no Supabase credentials)'));
        return [];
    }

    // Simulate the work done per operator in POST /api/requests:
    //   1. DB read (operator profile / claim code check)
    //   2. DB write (notifications INSERT)
    // We'll simulate with SELECT + SELECT (read-only safe)
    async function simulateOperatorWork(operatorCount) {
        const { data: ops } = await supabase.from('operators')
            .select('id, profile_id, company_email').limit(operatorCount);
        if (!ops || ops.length === 0) return;

        // Each operator: DB read + notifications lookup (simulates email+notification path)
        async function perOperator(op) {
            await supabase.from('operators').select('id, company_name, rating').eq('id', op.id).single();
            if (op.profile_id) {
                await supabase.from('notifications').select('id').eq('user_id', op.profile_id).limit(1);
            }
        }

        return ops;
    }

    const operatorCounts = [1, 3, 5, 7];
    const results = [];

    for (const count of operatorCounts) {
        const { data: ops } = await supabase.from('operators')
            .select('id, profile_id, company_email').eq('is_verified', true).limit(count);

        if (!ops || ops.length === 0) {
            console.log(c('gray', `  (skipping count=${count}, no operators found)`));
            continue;
        }

        async function perOperator(op) {
            await supabase.from('operators').select('id, company_name, rating').eq('id', op.id).single();
            if (op.profile_id) {
                await supabase.from('notifications').select('id').eq('user_id', op.profile_id).limit(1);
            }
        }

        const ITERS = 4;

        // Serial timing
        const serialTimes = [];
        for (let i = 0; i < ITERS; i++) {
            const t0 = Date.now();
            for (const op of ops) await perOperator(op);
            serialTimes.push(Date.now() - t0);
            await new Promise(r => setTimeout(r, 30));
        }
        const serialStats = stats(serialTimes);

        // Parallel timing
        const parallelTimes = [];
        for (let i = 0; i < ITERS; i++) {
            const t0 = Date.now();
            await Promise.all(ops.map(perOperator));
            parallelTimes.push(Date.now() - t0);
            await new Promise(r => setTimeout(r, 30));
        }
        const parallelStats = stats(parallelTimes);

        const improvement = Math.round((1 - parallelStats.p95 / serialStats.p95) * 100);
        const impLabel = improvement > 0
            ? c('green', `↓${improvement}% faster parallel`)
            : c('red', `↑${Math.abs(improvement)}% slower parallel`);

        const rSerial = { label: `SERIAL  loop — ${count} operators`, ...serialStats, errors: 0, lastStatus: 0, n: ITERS };
        const rParallel = { label: `PARALLEL loop — ${count} operators`, ...parallelStats, errors: 0, lastStatus: 0, n: ITERS };

        printRow(rSerial);
        printRow(rParallel);
        console.log(c('cyan', `    └─ ${impLabel}  (serial p95=${serialStats.p95}ms → parallel p95=${parallelStats.p95}ms)`));

        results.push(rSerial, rParallel);
    }

    return results;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary(allResults) {
    section('📊 Performance Summary & Bottleneck Report');

    const apiResults = allResults.filter(r => r.lastStatus);
    const dbResults = allResults.filter(r => !r.lastStatus);

    const slowApi = [...apiResults].sort((a, b) => b.p95 - a.p95).slice(0, 5);
    const slowDb = [...dbResults].sort((a, b) => b.p95 - a.p95).slice(0, 5);

    console.log('\n' + c('bold', '  🔴 TOP 5 SLOWEST API ENDPOINTS (p95):'));
    slowApi.forEach((r, i) => {
        const flag = r.p95 >= 1000 ? ' 🚨 CRITICAL' : r.p95 >= 500 ? ' ⚠️  WARN' : '';
        console.log(`    ${i + 1}. ${latencyLabel(r.p95).padEnd(20)}  ${r.label}${flag}`);
    });

    console.log('\n' + c('bold', '  🔴 TOP 5 SLOWEST DB QUERIES (p95):'));
    slowDb.forEach((r, i) => {
        const flag = r.p95 >= 500 ? ' 🚨 CRITICAL' : r.p95 >= 200 ? ' ⚠️  WARN' : '';
        console.log(`    ${i + 1}. ${latencyLabel(r.p95).padEnd(20)}  ${r.label}${flag}`);
    });

    console.log('\n' + c('bold', '  📌 IDENTIFIED BOTTLENECKS:'));

    const issues = [];

    allResults.forEach(r => {
        if (r.label.includes('SEQUENTIAL') && r.p95 > 200) {
            issues.push({
                severity: '🔴 HIGH', label: r.label, p95: r.p95,
                fix: 'Merge into a single JOIN query or run queries in parallel with Promise.all()'
            });
        }
        if (r.label.includes('N+1') && r.p95 > 300) {
            issues.push({
                severity: '🔴 HIGH', label: r.label, p95: r.p95,
                fix: 'Replace N+1 loop with a single Supabase join (operator_profiles!profile_id)'
            });
        }
        if (r.label.includes('geocode') && r.p95 > 400) {
            issues.push({
                severity: '🟡 MED', label: r.label, p95: r.p95,
                fix: 'Cache geocoding results in Supabase or Redis; avoid calling on every POST /api/requests'
            });
        }
        if (r.label.includes('app_settings') && r.p95 > 100) {
            issues.push({
                severity: '🟡 MED', label: r.label, p95: r.p95,
                fix: 'Cache app_settings in-memory (module-level singleton, TTL 60s) — currently hit on every request'
            });
        }
        if (r.label.includes('operator match') && r.p95 > 300) {
            issues.push({
                severity: '🟡 MED', label: r.label, p95: r.p95,
                fix: 'Add composite DB index: CREATE INDEX ON operators(is_verified, is_active, is_accepting_requests)'
            });
        }
    });

    if (issues.length === 0) {
        console.log(c('green', '    ✅ No critical bottlenecks detected'));
    } else {
        issues.forEach((issue, i) => {
            console.log(`\n    ${issue.severity} [p95=${issue.p95}ms]  ${issue.label}`);
            console.log(c('gray', `       FIX: ${issue.fix}`));
        });
    }

    console.log('\n' + c('bold', '  📋 RAW FINDINGS TABLE:'));
    console.log(c('gray', `    ${'Label'.padEnd(56)} ${'p50'.padEnd(8)} ${'p95'.padEnd(8)} ${'p99'.padEnd(8)}`));
    allResults.forEach(r => {
        console.log(`    ${r.label.substring(0, 55).padEnd(56)} ${String(r.p50).padEnd(8)} ${String(r.p95).padEnd(8)} ${r.p99}`);
    });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + c('bold', c('cyan', '╔══════════════════════════════════════════════════╗')));
    console.log(c('bold', c('cyan', '║     BUSINTO PERFORMANCE BENCHMARK SUITE          ║')));
    console.log(c('bold', c('cyan', '╚══════════════════════════════════════════════════╝')));
    console.log(c('gray', `  Target:     ${BASE_URL}`));
    console.log(c('gray', `  Iterations: ${ITERATIONS} per endpoint`));
    console.log(c('gray', `  Time:       ${new Date().toISOString()}\n`));

    // Check server is up
    try {
        const res = await fetch(BASE_URL + '/', { signal: AbortSignal.timeout(5000) });
        console.log(c('green', `  ✅ Server reachable (HTTP ${res.status})`));
    } catch (e) {
        console.error(c('red', `  ❌ Cannot reach ${BASE_URL} — is the dev server running?`));
        console.error(c('gray', '     Run: npm run dev'));
        process.exit(1);
    }

    if (!supabase) {
        console.log(c('yellow', '  ⚠ Supabase env vars not found — DB benchmarks will be skipped'));
    } else {
        console.log(c('green', '  ✅ Supabase connected'));
    }

    const td = await resolveTestData();

    const apiResults = await benchApiEndpoints(td);
    const dbResults = await benchDatabaseQueries();
    const matchingResults = await benchOperatorMatching(td);
    const pathResults = await benchCriticalPaths();
    const acceptResults = await benchQuoteAcceptWaterfall();
    const loopResults = await benchOperatorLoopConcurrency();

    const allResults = [...apiResults, ...dbResults, ...matchingResults, ...pathResults, ...acceptResults, ...loopResults];
    printSummary(allResults);

    console.log('\n' + c('bold', c('cyan', '  Benchmark complete.')));
    console.log(c('gray', '  See PERFORMANCE_REPORT.md in artifacts for root cause analysis.\n'));
}

main().catch(err => {
    console.error(c('red', '\n  Fatal benchmark error:'), err);
    process.exit(1);
});
