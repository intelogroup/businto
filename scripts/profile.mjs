#!/usr/bin/env node
/**
 * Businto CPU Profiler Wrapper
 * ==============================
 * Runs the benchmark suite under Node --prof to produce a V8 CPU profile,
 * then processes it into a human-readable tick summary.
 *
 * Usage:
 *   node scripts/profile.mjs                     # full benchmark + profile
 *   node scripts/profile.mjs operator-loop       # only benchmark-operator-loop.mjs
 *   node scripts/profile.mjs verify              # only benchmark-verify.mjs
 *
 * Output:
 *   .perf/isolate-*.log     — raw V8 profile (input to --prof-process)
 *   .perf/tick-summary.txt  — human-readable hotspot breakdown
 *   .perf/flamegraph.html   — interactive flamegraph (if 0x is installed)
 *
 * Requirements:
 *   node >= 18 (--prof and --prof-process built-in)
 *   Optional: npm install -g 0x   (for flamegraph HTML output)
 */

import { execSync, spawn } from 'child_process';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PERF_DIR = join(ROOT, '.perf');

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const A = { reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const c = (col, s) => A[col] + s + A.reset;

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_MAP = {
    'full':          join(__dirname, 'benchmark.mjs'),
    'operator-loop': join(__dirname, 'benchmark-operator-loop.mjs'),
    'verify':        join(__dirname, 'benchmark-verify.mjs'),
};

const target = process.argv[2] || 'operator-loop';
const scriptPath = TARGET_MAP[target];

if (!scriptPath || !existsSync(scriptPath)) {
    console.error(c('red', `  ✗ Unknown target: "${target}". Choose from: ${Object.keys(TARGET_MAP).join(', ')}`));
    process.exit(1);
}

mkdirSync(PERF_DIR, { recursive: true });

console.log('\n' + c('bold', c('cyan', '╔═══════════════════════════════════════════════════════╗')));
console.log(c('bold', c('cyan', '║   BUSINTO — CPU PROFILER (Node --prof wrapper)        ║')));
console.log(c('bold', c('cyan', '╚═══════════════════════════════════════════════════════╝')));
console.log(c('gray', `  Target script: ${scriptPath}`));
console.log(c('gray', `  Profile dir:   ${PERF_DIR}`));
console.log(c('gray', `  ${new Date().toISOString()}\n`));

// ─── Step 1: Run benchmark under --prof ───────────────────────────────────────
console.log(c('bold', '  Step 1/3 — Running benchmark under Node --prof…'));

const profLogPattern = join(ROOT, 'isolate-*.log');

// Clean up any previous isolate logs in root
try {
    readdirSync(ROOT).filter(f => f.startsWith('isolate-') && f.endsWith('.log')).forEach(f => {
        const { unlinkSync } = await import('fs').catch(() => ({ unlinkSync: () => {} }));
    });
} catch { /* ignore */ }

const profArgs = [
    '--prof',
    '--prof-sampling-interval=1',  // 1ms sampling interval for fine granularity
    scriptPath
];

const envVars = {
    ...process.env,
    ENABLE_PERF_TRACE: '0', // disable console.log trace noise during profiling
    ITERATIONS: '15',        // more iterations = better profile coverage
    ITERS: '10',
};

let profExitCode = 0;
try {
    execSync(`node ${profArgs.join(' ')}`, {
        cwd: ROOT,
        env: envVars,
        stdio: 'inherit',
        timeout: 5 * 60 * 1000 // 5 minute max
    });
} catch (e) {
    profExitCode = e.status || 1;
    console.log(c('yellow', '  ⚠ Benchmark exited with non-zero code (expected if DB is unavailable)'));
}

// ─── Step 2: Find and move the isolate log ────────────────────────────────────
console.log(c('bold', '\n  Step 2/3 — Processing V8 tick log…'));

const isolateLogs = readdirSync(ROOT)
    .filter(f => f.startsWith('isolate-') && f.endsWith('.log'))
    .map(f => join(ROOT, f));

if (isolateLogs.length === 0) {
    console.error(c('red', '  ✗ No isolate-*.log found. --prof may have been ignored (e.g. inside ESM loader).'));
    console.log(c('gray', '  Tip: Try running directly: node --prof scripts/benchmark-operator-loop.mjs'));
    console.log(c('gray', '  Then: node --prof-process isolate-*.log > .perf/tick-summary.txt'));
    process.exit(1);
}

const latestLog = isolateLogs.sort().pop();
const destLog = join(PERF_DIR, 'isolate-profile.log');

try {
    const { renameSync } = await import('fs').catch(() => null) || {};
    // Copy instead of rename to avoid cross-device issues
    execSync(`cp "${latestLog}" "${destLog}"`, { cwd: ROOT });
    execSync(`rm -f "${latestLog}"`, { cwd: ROOT });
    console.log(c('green', `  ✓ Profile log: ${destLog}`));
} catch {
    console.log(c('yellow', `  ⚠ Could not move log to ${PERF_DIR}, using ${latestLog}`));
}

// ─── Step 3: Process into human-readable tick summary ─────────────────────────
console.log(c('bold', '\n  Step 3/3 — Generating tick summary…'));

const summaryPath = join(PERF_DIR, 'tick-summary.txt');
const logToProcess = existsSync(destLog) ? destLog : latestLog;

try {
    const summary = execSync(`node --prof-process "${logToProcess}"`, {
        cwd: ROOT,
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024
    }).toString();

    writeFileSync(summaryPath, summary, 'utf8');
    console.log(c('green', `  ✓ Tick summary written: ${summaryPath}`));

    // Print top 20 lines of the JavaScript section
    const jsSection = summary.split('[JavaScript]')[1]?.split('[C++]')[0] || '';
    const topLines = jsSection.trim().split('\n').slice(0, 20);
    if (topLines.length > 0) {
        console.log('\n' + c('bold', '  🔥 Top JavaScript hotspots (from tick summary):'));
        console.log(c('gray', '  ' + '─'.repeat(80)));
        topLines.forEach(l => {
            const hot = l.includes('operator-matching') || l.includes('requests') || l.includes('haversine') || l.includes('calculateScore');
            console.log(hot ? c('yellow', '  ' + l) : c('gray', '  ' + l));
        });
    }
} catch (e) {
    console.error(c('red', '  ✗ --prof-process failed:'), e.message);
    console.log(c('gray', `  Manual processing: node --prof-process "${logToProcess}" > .perf/tick-summary.txt`));
}

// ─── Optional: 0x flamegraph ──────────────────────────────────────────────────
let has0x = false;
try { execSync('which 0x', { stdio: 'ignore' }); has0x = true; } catch { }

if (has0x) {
    console.log(c('bold', '\n  Optional — Generating 0x flamegraph (detected in PATH)…'));
    try {
        const flamePath = join(PERF_DIR, 'flamegraph');
        execSync(`0x --output-dir "${flamePath}" -- node "${scriptPath}"`, {
            cwd: ROOT,
            env: { ...envVars, ITERATIONS: '5', ITERS: '5' },
            timeout: 3 * 60 * 1000,
            stdio: 'inherit'
        });
        console.log(c('green', `  ✓ Flamegraph: ${flamePath}/`));
    } catch {
        console.log(c('yellow', '  ⚠ 0x flamegraph generation failed (non-fatal)'));
    }
} else {
    console.log(c('gray', '\n  Tip: Install 0x for interactive flamegraphs: npm install -g 0x'));
    console.log(c('gray', '  Then re-run: node scripts/profile.mjs operator-loop'));
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + c('bold', c('cyan', '  ═══════════════════════════════════════════════')));
console.log(c('bold', '  Profiling complete. Key files:'));
console.log(c('gray', `    ${summaryPath}`));
console.log(c('gray', `    ${logToProcess}`));
console.log(c('bold', c('cyan', '  ═══════════════════════════════════════════════\n')));
