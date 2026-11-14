/**
 * PERMANENT — boundary parsers for filter-shaped inputs (Lane B,
 * 2026-11-14): parseSearchTerm / parseMonthParam / parseEnumParam in
 * src/lib/boundary.ts.
 *
 * Invariants (the module doctrine applied to filters):
 * - A search term enters a LIKE pattern only escaped — backslash
 *   first, then % and _ — so it can match only itself literally
 *   (BUS-DIRECTORY-LOCATION-WILDCARD-001).
 * - A term destined for a PostgREST .or() STRING additionally
 *   refuses the grammar characters escaping cannot make literal
 *   (BUS-ADMIN-USERS-SEARCH-INJECTION-001).
 * - A supplied month is a valid YYYY-MM or a refusal — never a
 *   silent drop into an unfiltered result
 *   (BUS-EARNINGS-MONTH-FILTER-001).
 * - A supplied enum filter is a member of its allowlist or a
 *   refusal — never a verbatim pass-through that fails closed only
 *   by accident.
 */
import { describe, it, expect } from 'vitest';
import { parseSearchTerm, parseMonthParam, parseEnumParam } from '@/lib/boundary';

describe('parseSearchTerm — LIKE escaping', () => {
  it('passes a plain term through unchanged', () => {
    expect(parseSearchTerm('Everett')).toEqual({ ok: true, value: 'Everett' });
  });
  it('escapes % and _ so they match only themselves', () => {
    expect(parseSearchTerm('100%')).toEqual({ ok: true, value: '100\\%' });
    expect(parseSearchTerm('_verett')).toEqual({ ok: true, value: '\\_verett' });
  });
  it('escapes backslash FIRST, so an attacker backslash cannot escape the escaping', () => {
    expect(parseSearchTerm('a\\b')).toEqual({ ok: true, value: 'a\\\\b' });
    // Input "\%": the backslash doubles, then % gains its own escape.
    expect(parseSearchTerm('\\%')).toEqual({ ok: true, value: '\\\\\\%' });
  });
  it('without orString, commas and dots are ordinary characters (parameterized value)', () => {
    expect(parseSearchTerm('a,b.c')).toEqual({ ok: true, value: 'a,b.c' });
  });
});

describe('parseSearchTerm — or() string refusal', () => {
  it('refuses every PostgREST grammar character', () => {
    for (const bad of ['a,b', 'a.b', 'a(b', 'a)b', 'a:b', 'a*b', "a'b", 'a"b']) {
      const parsed = parseSearchTerm(bad, { orString: true });
      expect(parsed.ok, bad).toBe(false);
    }
  });
  it('refuses the recorded injection shape outright', () => {
    expect(parseSearchTerm('nomatch%,role.ilike.operato', { orString: true }).ok).toBe(false);
  });
  it('still escapes (does not refuse) % and _ in orString mode', () => {
    expect(parseSearchTerm('100%', { orString: true })).toEqual({ ok: true, value: '100\\%' });
    expect(parseSearchTerm('_lice', { orString: true })).toEqual({ ok: true, value: '\\_lice' });
  });
  it('accepts an ordinary term in orString mode', () => {
    expect(parseSearchTerm('alice', { orString: true })).toEqual({ ok: true, value: 'alice' });
  });
});

describe('parseMonthParam', () => {
  it('absent or empty means no filter, not a refusal', () => {
    expect(parseMonthParam(null)).toEqual({ ok: true, value: null });
    expect(parseMonthParam('')).toEqual({ ok: true, value: null });
  });
  it('accepts a valid YYYY-MM', () => {
    expect(parseMonthParam('2026-11')).toEqual({ ok: true, value: '2026-11' });
    expect(parseMonthParam('2026-01')).toEqual({ ok: true, value: '2026-01' });
    expect(parseMonthParam('2026-12')).toEqual({ ok: true, value: '2026-12' });
  });
  it('refuses impossible months', () => {
    expect(parseMonthParam('2026-13').ok).toBe(false);
    expect(parseMonthParam('2026-00').ok).toBe(false);
  });
  it('refuses every near-miss shape instead of dropping it', () => {
    for (const bad of ['garbage', '2026-1', '2026-11-01', '26-11', '2026/11', ' 2026-11']) {
      expect(parseMonthParam(bad).ok, bad).toBe(false);
    }
  });
});

describe('parseEnumParam', () => {
  const ROLES = ['user', 'operator', 'manager', 'admin'] as const;
  it('absent or empty means no filter, not a refusal', () => {
    expect(parseEnumParam(null, 'role', ROLES)).toEqual({ ok: true, value: null });
    expect(parseEnumParam('', 'role', ROLES)).toEqual({ ok: true, value: null });
  });
  it('accepts allowlist members exactly', () => {
    expect(parseEnumParam('operator', 'role', ROLES)).toEqual({ ok: true, value: 'operator' });
    expect(parseEnumParam('manager', 'role', ROLES)).toEqual({ ok: true, value: 'manager' });
  });
  it('refuses non-members, including case variants', () => {
    expect(parseEnumParam('bogus', 'role', ROLES).ok).toBe(false);
    expect(parseEnumParam('Admin', 'role', ROLES).ok).toBe(false);
    expect(parseEnumParam('admin ', 'role', ROLES).ok).toBe(false);
  });
});
