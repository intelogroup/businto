/**
 * PERMANENT — census guard (Lane B, 2026-11-14). Static source scan:
 * no template literal in src/ may interpolate a variable into a
 * PostgREST .or() / .ilike() call outside the allowlist below, and
 * no .or()/.ilike() argument may be built by string concatenation.
 *
 * Why: the two user-input interpolation sites this lane closed
 * (BUS-DIRECTORY-LOCATION-WILDCARD-001,
 * BUS-ADMIN-USERS-SEARCH-INJECTION-001) existed because raw caller
 * text was interpolated into a filter string. The exhaustive census
 * behind the fix found exactly five interpolation sites in src/;
 * every one is allowlisted here with its reason, and each reason is
 * re-verified by this test (session-derived values, server-computed
 * dates, or a term that passed through parseSearchTerm). A NEW
 * interpolation site fails this test at introduction instead of
 * surfacing in a later adversarial-loop cycle.
 *
 * Extension (2026-11-16): the same census discipline for the filter
 * and coordinate parsers. The three routes the 2026-11-15/16 cycles
 * carded (BUS-BOOKINGS-STATUS-001, BUS-ADMIN-REQUESTS-STATUS-001,
 * BUS-MAPS-DISTANCE-COORD-SHAPE-001) bypassed parsers that already
 * existed for their siblings; the REQUIRED_PARSERS census below pins
 * each route to its parser so a future edit cannot quietly drop the
 * call and reopen the bypass family.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Files allowed to interpolate into .or()/.ilike(), with the reason
 *  the interpolated values are safe. Keys are repo-relative paths. */
const ALLOWLIST: Record<string, { reason: string; mustUseParseSearchTerm?: boolean }> = {
  'src/app/api/messages/route.ts': {
    reason: 'interpolates only the session user id (server-derived) into eq clauses',
  },
  'src/app/api/messages/threads/route.ts': {
    reason: 'interpolates only the session user id (server-derived) into eq clauses',
  },
  'src/app/api/cron/process-completed-trips/route.ts': {
    reason: 'interpolates only server-computed dates into lte clauses',
  },
  'src/app/api/operators/directory/route.ts': {
    reason: 'location reaches the ilike pattern only after parseSearchTerm escaping',
    mustUseParseSearchTerm: true,
  },
  'src/app/api/master/admin/users/route.ts': {
    reason: 'search reaches the or() string only after parseSearchTerm escaping + grammar refusal',
    mustUseParseSearchTerm: true,
  },
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Return the argument-list spans of every .or( / .ilike( call in the
 * source (paren-depth aware, so nested calls and multi-line template
 * literals are handled).
 */
function callSpans(source: string): string[] {
  const spans: string[] = [];
  const callRe = /\.(?:or|ilike)\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(source)) !== null) {
    let depth = 1;
    let i = callRe.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    spans.push(source.slice(callRe.lastIndex, i - 1));
  }
  return spans;
}

/** A span interpolates if a template literal inside it contains ${,
 *  or if it concatenates strings/variables with +. */
function spanInterpolates(span: string): boolean {
  const templateRe = /`(?:[^`\\]|\\.)*`/g;
  let t: RegExpExecArray | null;
  while ((t = templateRe.exec(span)) !== null) {
    if (t[0].includes('${')) return true;
  }
  if (/['"]\s*\+|\+\s*['"]/.test(span)) return true;
  return false;
}

describe('census guard: no unvetted interpolation into .or()/.ilike() filter strings', () => {
  const files = walk(SRC);
  const offenders: Array<{ file: string; span: string }> = [];
  const interpolatingFiles = new Set<string>();

  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const source = readFileSync(file, 'utf8');
    for (const span of callSpans(source)) {
      if (spanInterpolates(span)) {
        interpolatingFiles.add(rel);
        if (!(rel in ALLOWLIST)) {
          offenders.push({ file: rel, span: span.trim().slice(0, 120) });
        }
      }
    }
  }

  it('finds interpolation only at the allowlisted sites', () => {
    expect(
      offenders,
      `unvetted .or()/.ilike() interpolation: ${JSON.stringify(offenders, null, 2)}`
    ).toEqual([]);
  });

  it('the interpolation census is exactly the allowlist (no site silently vanished)', () => {
    expect([...interpolatingFiles].sort()).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it('every allowlisted parseSearchTerm site still routes through parseSearchTerm', () => {
    for (const [rel, entry] of Object.entries(ALLOWLIST)) {
      if (!entry.mustUseParseSearchTerm) continue;
      const source = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(source, `${rel}: ${entry.reason}`).toContain('parseSearchTerm');
    }
  });
});

/** Routes pinned to the boundary parsers their inputs require, with
 *  the card that proved the bypass. A route that stops calling its
 *  parser fails here at edit time, not in a later loop cycle. */
const REQUIRED_PARSERS: Record<string, { parsers: string[]; card: string }> = {
  'src/app/api/bookings/route.ts': {
    parsers: ['parsePagination', 'parseEnumParam'],
    card: 'BUS-BOOKINGS-STATUS-001',
  },
  'src/app/api/master/admin/requests/route.ts': {
    parsers: ['parsePagination', 'parseEnumParam'],
    card: 'BUS-ADMIN-REQUESTS-STATUS-001',
  },
  'src/app/api/maps/distance/route.ts': {
    parsers: ['parseCoordinate'],
    card: 'BUS-MAPS-DISTANCE-COORD-SHAPE-001',
  },
  // Extension (2026-11-17 fix-all follow-ups): the validate-bound-
  // throttle cards of 2026-11-16/17 pinned their routes to the same
  // boundary parsers — a route that stops parsing its typed fields
  // fails here at edit time.
  'src/app/api/requests/route.ts': {
    parsers: ['parseTextField', 'parseCoordinate'],
    card: 'BUS-REQUEST-CREATE-SHAPE-001',
  },
  'src/app/api/email/send/route.ts': {
    parsers: ['parseTextField'],
    card: 'BUS-EMAIL-SEND-TYPE-SHAPE-001',
  },
  'src/app/api/logs/route.ts': {
    parsers: ['parseTextField', 'parsePlainObject'],
    card: 'BUS-LOGS-SHAPE-FLOOD-001',
  },
  'src/app/api/geocode/route.ts': {
    parsers: ['parseLimitParam'],
    card: 'BUS-GEOCODE-COST-001',
  },
};

describe('census guard: carded routes still route through their boundary parsers', () => {
  for (const [rel, entry] of Object.entries(REQUIRED_PARSERS)) {
    it(`${rel} uses ${entry.parsers.join(' + ')} (${entry.card})`, () => {
      const source = readFileSync(path.join(ROOT, rel), 'utf8');
      for (const parser of entry.parsers) {
        expect(source, `${rel} must keep calling ${parser} (${entry.card})`).toContain(parser);
      }
    });
  }
});

/** Routes pinned to the shared throttle: the cost cards of
 *  2026-11-16 proved these routes reached a paid or proxied upstream
 *  (LLM inference, the Photon geocoder, the event log) with no
 *  checkRateLimit call at all. A route that drops the call reopens
 *  its card's family. (BUS-RATE-LIMIT-XFF-SPOOF-001 is pinned
 *  behaviorally instead — tests/rate-limit-xff-identity.test.ts
 *  exercises getClientIP + checkRateLimit composed exactly as the
 *  routes compose them.) */
const REQUIRED_THROTTLES: Record<string, { card: string }> = {
  'src/app/api/chat/route.ts': { card: 'BUS-CHAT-LLM-COST-001' },
  'src/app/api/chat/suggestions/route.ts': { card: 'BUS-CHAT-LLM-COST-001' },
  'src/app/api/geocode/route.ts': { card: 'BUS-GEOCODE-COST-001' },
  'src/app/api/logs/route.ts': { card: 'BUS-LOGS-SHAPE-FLOOD-001' },
};

describe('census guard: carded routes still throttle through checkRateLimit', () => {
  for (const [rel, entry] of Object.entries(REQUIRED_THROTTLES)) {
    it(`${rel} uses checkRateLimit (${entry.card})`, () => {
      const source = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(source, `${rel} must keep calling checkRateLimit (${entry.card})`).toContain('checkRateLimit');
    });
  }
});
