<todos title="Fix Brevo corrupted tracking links in operator emails" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [x] read-existing-benchmarks: Read existing benchmark scripts and key source files for context 🔴
- [x] instrument-requests-route: Add performance.mark/measure instrumentation to POST /api/requests/route.ts hot-path waterfall 🔴
- [x] instrument-operator-matching: Add timing instrumentation to src/lib/operator-matching.ts (findMatchingOperators, geocodeAddressInternal, calculateScore) 🔴
- [x] instrument-middleware: Add dev-only timing shim to middleware.ts around updateSession() 🟡
- [x] extend-benchmark-script: Extend scripts/benchmark.mjs with serial-vs-parallel operator loop benchmark, quote accept waterfall, and per-step attribution 🔴
- [x] create-profiling-script: Create scripts/profile.mjs — wraps benchmark with Node --prof + flamegraph processing instructions 🟡
- [x] create-parallel-benchmark: Create scripts/benchmark-operator-loop.mjs — serial vs parallel operator loop concurrency benchmark 🟡
- [x] run-benchmarks: Run the full benchmark suite and capture output for bottleneck ranking 🔴
- [x] produce-report: Produce ranked bottleneck report comparing against baselines in benchmark-verify.mjs 🟡
</todos>

<!-- Auto-generated todo section -->
<!-- Add your custom Copilot instructions below -->
