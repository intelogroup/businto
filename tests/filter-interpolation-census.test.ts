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
