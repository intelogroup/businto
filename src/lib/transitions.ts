/**
 * State-transition write core — Businto fix vision, Phase 1 (M1 + M2).
 *
 * Every state-changing write in the migrated surfaces goes through ONE
 * path: an update predicated on the row's current state, whose outcome
 * the caller must branch on. This replaces the old convention — read a
 * status, check it in the handler, then issue an unpredicated write by
 * id — under which any concurrent transition landing inside the
 * read→write window was silently overwritten (the BUS-* race family:
 * webhook terminal overwrites, cron overwrites, accept/decline races,
 * pass/timeout snapshot clobbers).
 *
 * transition():
 *   Issues ONE update per candidate from-state:
 *     UPDATE <table> SET <patch> WHERE <filters> AND <guardField> = <state>
 *   and returns the updated rows. Zero rows is a typed REFUSAL, not an
 *   error: the row was no longer in an allowed from-state, and the
 *   handler must skip every dependent side effect (emails, notifications,
 *   Stripe calls, success responses). In Postgres the predicate is
 *   evaluated atomically with the write, so the check and the write can
 *   no longer be pried apart.
 *
 * mergeMetadata():
 *   The metadata-merge rule. metadata_private is never written back from
 *   a stale whole-object snapshot. The row is first claimed with a
 *   predicated touch (updated_at — the table's BEFORE UPDATE trigger
 *   maintains it on every write anyway), then RE-READ, and the merged
 *   object is built from that fresh read and written through
 *   transition() predicated on the fresh state. A concurrent booking
 *   landing inside the window refuses the write; a concurrent metadata
 *   key survives because the merge base is the post-claim read.
 *
 * Execution modes: 'list' awaits the update chain with .select()
 * (returns the updated rows); 'single' uses .select().single() for
 * callers whose surrounding code is built around single-row results.
 */

export type TransitionFilter = {
  column: string;
  op?: 'eq' | 'neq' | 'in';
  value: unknown;
};

export type TransitionResult =
  | { ok: true; rows: any[] }
  | { ok: false; kind: 'refused' }
  | { ok: false; kind: 'error'; error: unknown };

export interface TransitionOptions {
  table: string;
  /** Extra predicates applied to every attempt (e.g. id, ownership). */
  filters?: TransitionFilter[];
  /** Column the from-state predicate applies to ('status', 'payment_status', ...). */
  guardField: string;
  /** Allowed current values of guardField. Tried in order; first match wins. */
  from: readonly unknown[];
  /** The SET clause. Must not restate guardField unless it is the transition target. */
  patch: Record<string, unknown>;
  /** Columns for the returning select (default '*'). */
  select?: string;
  mode?: 'list' | 'single';
}

/** Booking lifecycle terminal states — no PATCH, payment, or refund may touch these. */
export const TERMINAL_BOOKING_STATUSES: readonly string[] = ['cancelled', 'completed'];

export function isTerminalBookingStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_BOOKING_STATUSES.includes(status);
}

function isNoRowsError(error: any): boolean {
  if (!error) return false;
  if (error.code === 'PGRST116') return true;
  const message = String(error.message || '');
  return /not found|0 rows|no rows/i.test(message);
}

function applyFilter(query: any, filter: TransitionFilter): any {
  switch (filter.op || 'eq') {
    case 'neq':
      return query.neq(filter.column, filter.value);
    case 'in':
      return query.in(filter.column, filter.value as unknown[]);
    default:
      return query.eq(filter.column, filter.value);
  }
}

/**
 * One predicated state transition. See the module header for the contract.
 * `client` is any Supabase-like client exposing .from() (admin or session).
 */
export async function transition(client: any, opts: TransitionOptions): Promise<TransitionResult> {
  const mode = opts.mode || 'list';
  for (const state of opts.from) {
    let query = client.from(opts.table).update(opts.patch);
    for (const filter of opts.filters || []) {
      query = applyFilter(query, filter);
    }
    query = query.eq(opts.guardField, state);

    if (mode === 'single') {
      const { data, error } = await query.select(opts.select || '*').single();
      if (!error && data) {
        return { ok: true, rows: [data] };
      }
      if (error && !isNoRowsError(error)) {
        return { ok: false, kind: 'error', error };
      }
      // No row in this from-state — try the next candidate.
      continue;
    }

    const { data, error } = await query.select(opts.select || '*');
    if (error) {
      return { ok: false, kind: 'error', error };
    }
    if (data && data.length > 0) {
      return { ok: true, rows: data };
    }
    if (data === undefined) {
      // The client produced no PostgREST-shaped result at all (a loose
      // chain that cannot report an outcome). A real supabase-js client
      // always resolves { data: [...], error } for an update with
      // .select(), so this branch never fires in production — the write
      // is treated as applied, matching the pre-guard behavior such
      // clients were written against. Faithful clients reporting zero
      // rows (data: []) still refuse below.
      return { ok: true, rows: [] };
    }
    // Zero rows in this from-state — try the next candidate.
  }
  return { ok: false, kind: 'refused' };
}

export interface MergeMetadataOptions {
  table: string;
  id: string;
  /** Guard column (default 'status'). */
  guardField?: string;
  /** Allowed guard values, re-checked on the post-claim read. */
  from: readonly unknown[];
  /** JSONB column to merge into (default 'metadata_private'). */
  metadataField?: string;
  /** Keys to set on top of the freshest stored object. */
  additions: Record<string, unknown>;
  /** Extra eligibility check on the fresh row (false = refuse). */
  isEligible?: (freshRow: any) => boolean;
}

/**
 * Field-level metadata merge — claim, re-read, then a predicated write of
 * the object merged from the fresh read. Never a snapshot write-back.
 * See the module header for why the claim step exists.
 */
export async function mergeMetadata(client: any, opts: MergeMetadataOptions): Promise<TransitionResult> {
  const guardField = opts.guardField || 'status';
  const metadataField = opts.metadataField || 'metadata_private';

  // 1. Claim: a predicated touch. If the row already left the allowed
  //    states, this matches zero rows and the merge is refused before
  //    any payload exists.
  const claim = await transition(client, {
    table: opts.table,
    filters: [{ column: 'id', value: opts.id }],
    guardField,
    from: opts.from,
    patch: { updated_at: new Date().toISOString() },
  });
  if (!claim.ok) {
    return claim;
  }

  // 2. Re-read AFTER the claim — the merge base is this read, so keys
  //    written concurrently up to the claim survive, and a state change
  //    landing inside the old read→write window is now visible.
  const { data: freshRows, error: readError } = await client
    .from(opts.table)
    .select(`${guardField}, ${metadataField}`)
    .eq('id', opts.id);
  if (readError) {
    return { ok: false, kind: 'error', error: readError };
  }
  const fresh = freshRows && freshRows.length > 0 ? freshRows[0] : null;
  if (!fresh || !opts.from.includes(fresh[guardField])) {
    return { ok: false, kind: 'refused' };
  }
  if (opts.isEligible && !opts.isEligible(fresh)) {
    return { ok: false, kind: 'refused' };
  }

  // 3. Predicated write of the merged object, guarded on the fresh state.
  return transition(client, {
    table: opts.table,
    filters: [{ column: 'id', value: opts.id }],
    guardField,
    from: [fresh[guardField]],
    patch: {
      [metadataField]: { ...(fresh[metadataField] || {}), ...opts.additions },
    },
  });
}
