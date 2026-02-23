<todos title="Fix RocksDB .sst missing error" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [x] identify-failing-service: Identify which process emits RocksDB .sst error and is bound to port 3001 🔴
  _Port 3001 is Next.js (next-server v16.1.1). The .sst files are from Turbopack RocksDB cache under .next/dev/cache/turbopack._
- [x] locate-data-directory: Locate the data directory used by the failing service (db path with .sst files) 🔴
  _Corrupted RocksDB cache located at `.next/dev/cache/turbopack/*`._
- [x] choose-repair-strategy: Decide between repair, reindex, or wipe-and-reseed based on service and data criticality 🔴
  _Chose wipe-and-reseed (safe for dev cache). Removing `.next/dev/cache/turbopack` forces Turbopack to rebuild a clean cache._
- [x] apply-fix-and-verify: Apply chosen fix, restart service, and verify API at :3001 works 🔴
  _Stopped Next (PID 76098), cleared cache, restarted with `PORT=3001 npm run dev`. Server is ready and responding 200 for endpoints._
</todos>

<!-- Auto-generated todo section -->
<!-- Add your custom Copilot instructions below -->
