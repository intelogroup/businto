/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-1552; Phase 1 write core (src/lib/transitions.ts) — Businto
 * GET /api/cron/process-timeouts: for each stale dispatch code it re-reads
 * the request with .in('status',['pending','quoted']), then UPDATEs
 * metadata_private by id ONLY — no status predicate on the write — using a
 * read-modify-write spread of the STALE metadata_private snapshot.
 * Two interleavings land inside the read->write window (separate DB round
 * trips in production):
 *  A) a quote acceptance books the request — the cron still flags the
 *     booked request requires_manual_allocation=true + timeout_alerted_at.
 *  B) another writer adds a key to metadata_private — the cron's stale
 *     spread silently clobbers (loses) that concurrent update.
 * Invariant: cron batch effects apply only to rows still in the fetched
 * state at write time, and a read-modify-write must not lose a concurrent
 * metadata update.
 * Harness: in-memory mocked Supabase; selects snapshot at read time, the
 * update applies by id regardless of status (exactly the real query's
 * predicates); the interleaving is applied at update execution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const store: any = {
    codes: [] as any[],
    quotes: [] as any[],
    requests: [] as any[],
  };
  let interleave: null | ((row: any) => void) = null;
  class QB {
    table: string; op = "select"; filters: any[] = []; inFilters: any[] = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    lte() { return this; } gt() { return this; }
    not() { return this; }
    in(k: string, vs: any[]) { this.inFilters.push([k, vs]); return this; }
    update(p: any) { this.op = "update"; this.payload = p; return this; }
    match(r: any) {
      return this.filters.every(([k, v]) => r[k] === v) &&
        this.inFilters.every(([k, vs]) => vs.includes(r[k]));
    }
    exec() {
      if (this.table === "email_claim_codes") return store.codes;
      if (this.table === "quotes") return store.quotes.filter((r: any) => this.match(r));
      if (this.table === "transport_requests") {
        if (this.op === "update") {
          const rows = store.requests.filter((r: any) => this.filters.every(([k, v]: any) => r[k] === v));
          for (const r of rows) {
            if (interleave) { interleave(r); interleave = null; }
            Object.assign(r, this.payload);
          }
          return rows;
        }
        // snapshot semantics: return copies as read
        return store.requests.filter((r: any) => this.match(r)).map((r: any) => ({ ...r, metadata_private: { ...r.metadata_private } }));
      }
      return [];
    }
    async maybeSingle() { const rows = this.exec(); return { data: rows[0] ?? null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, setInterleave: (f: any) => { interleave = f; } };
});

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
vi.mock("@/lib/event-logger", () => ({ logEvent: async () => {} }));

import { GET } from "@/app/api/cron/process-timeouts/route";

const REQ = "req-timeout-1";
const OP = "op-1";

function seed(status = "pending") {
  h.store.codes = [{ resource_id: REQ, operator_id: OP }];
  h.store.quotes = [];
  h.store.requests = [{ id: REQ, status, metadata_private: { origin: "seed" } }];
  h.setInterleave(null);
  process.env.VERCEL_CRON_SECRET = "test-cron-secret";
}
function call() {
  return GET(new Request("http://localhost/api/cron/process-timeouts", {
    headers: { authorization: "Bearer test-cron-secret" },
  }) as any);
}
const row = () => h.store.requests[0];

describe("process-timeouts cron: stale read-modify-write on metadata_private", () => {
  beforeEach(() => seed());
  it("control: live pending request with no quote is flagged, seed metadata preserved", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(row().metadata_private.requires_manual_allocation).toBe(true);
    expect(row().metadata_private.timeout_alerted_at).toBeTruthy();
    expect(row().metadata_private.origin).toBe("seed");
  });
  it("sequential control: already-booked request is skipped at read time", async () => {
    seed("booked");
    const res = await call();
    expect(res.status).toBe(200);
    expect(row().metadata_private.requires_manual_allocation).toBeUndefined();
  });
  it("attack A: booking landing inside the read->write window must not be flagged for manual allocation", async () => {
    h.setInterleave((r: any) => { r.status = "booked"; });
    await call();
    expect(row().status).toBe("booked");
    expect(row().metadata_private.requires_manual_allocation).toBeUndefined();
    expect(row().metadata_private.timeout_alerted_at).toBeUndefined();
  });
  it("attack B: a concurrent metadata_private update inside the window must not be clobbered", async () => {
    h.setInterleave((r: any) => { r.metadata_private = { ...r.metadata_private, priority_paid: true }; });
    await call();
    expect(row().metadata_private.priority_paid).toBe(true);
  });
});
