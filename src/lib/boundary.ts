/**
 * Boundary parsing — Businto fix vision, Phase 4 (M5).
 *
 * Every input a route accepts is parsed HERE, once, by a typed parser
 * that returns a value or a refusal — never presence, truthiness, or
 * range folklore re-derived per route. The cards this layer retires
 * share that shape:
 *
 * parsePagination():
 *   Every list route parsed page/limit with its own hand-rolled
 *   parseInt + Math.min/Math.max folklore, and the clamps PROPAGATE
 *   NaN: `Math.min(50, Math.max(1, parseInt('abc')))` is NaN, which
 *   flowed into `.range(NaN, NaN)` and surfaced as a 500
 *   (BUS-DIRECTORY-PAGINATION-001, BUS-ADMIN-DISPUTES-PAGINATION-001,
 *   BUS-ADMIN-REQUESTS-PAGINATION-001, BUS-ADMIN-USERS-PAGINATION-001,
 *   BUS-QUOTES-PAGINATION-001). Non-positive values slipped through
 *   the same cracks as reversed/empty ranges. ONE parser now serves
 *   every list endpoint, public and admin (and the geocode proxy's
 *   limit, via parseLimitParam): a page/limit is a strict integer —
 *   digits only, no fractions, no exponents — page at or above the
 *   route's first page, limit a positive integer, or the request is
 *   refused 400 BEFORE any data-layer call. Defaults and clamping
 *   ceilings are per-route options so each route's happy-path
 *   contract is preserved exactly (directory/admin: 1-based, limit
 *   capped at 50; quotes: 0-based, limit capped at 100; admin
 *   requests/users: 1-based, no ceiling, as before).
 *
 * Field parsers (parseRating / parseTextField / parseStringArray):
 *   Write routes stored whatever JSON shape arrived, checking at most
 *   truthiness or range: a review rating of 4.5 or "5" passed
 *   `rating < 1 || rating > 5` (BUS-REVIEW-RATING-SHAPE-001), a
 *   numeric/array/object operator_response was stored verbatim
 *   (BUS-REVIEW-RESPONSE-SHAPE-001), special_instructions of any
 *   shape was copied into the booking update
 *   (BUS-BOOKING-INSTRUCTIONS-SHAPE-001), and the operator profile
 *   copied company_name / company_email / company_phone and
 *   service_areas verbatim (BUS-OPERATOR-PROFILE-COMPANY-SHAPE-001,
 *   BUS-OPERATOR-PROFILE-AREAS-SHAPE-001). The parsers check the TYPE
 *   first — an integer rating is an integer before it is in range; a
 *   text field is a string before it is stored — and the route
 *   refuses 400 before any write.
 */

export interface PaginationOptions {
  /** First valid page number: 1 everywhere except GET /api/quotes (0-based). */
  firstPage?: number;
  /** Page used when the parameter is absent or empty. Defaults to firstPage. */
  defaultPage?: number;
  /** Limit used when the parameter is absent or empty. Default 20. */
  defaultLimit?: number;
  /** Ceiling the limit is clamped to, where the route already had one. Omit for no clamp. */
  maxLimit?: number;
}

export type PaginationParse =
  | { ok: true; page: number; limit: number; from: number; to: number }
  | { ok: false; error: string };

export type FieldParse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Strict integer parse: the whole string must be an optional minus sign
 * followed by digits. Rejects 'abc', '1.5', '1e3', ' 1', '' — everything
 * parseInt would silently truncate or turn into NaN.
 */
function parseStrictInteger(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function parsePagination(
  searchParams: URLSearchParams,
  options: PaginationOptions = {}
): PaginationParse {
  const firstPage = options.firstPage ?? 1;
  const defaultPage = options.defaultPage ?? firstPage;
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit;

  const rawPage = searchParams.get('page');
  const rawLimit = searchParams.get('limit');

  let page = defaultPage;
  if (rawPage !== null && rawPage !== '') {
    const parsed = parseStrictInteger(rawPage);
    if (parsed === null || parsed < firstPage) {
      return {
        ok: false,
        error: `Invalid page: must be an integer of ${firstPage} or higher`,
      };
    }
    page = parsed;
  }

  let limit = defaultLimit;
  if (rawLimit !== null && rawLimit !== '') {
    const parsed = parseStrictInteger(rawLimit);
    if (parsed === null || parsed < 1) {
      return { ok: false, error: 'Invalid limit: must be a positive integer' };
    }
    limit = parsed;
  }
  if (maxLimit !== undefined && limit > maxLimit) {
    limit = maxLimit;
  }

  const from = (page - firstPage) * limit;
  return { ok: true, page, limit, from, to: from + limit - 1 };
}

/**
 * Single limit-style parameter (no page), for list-shaped upstreams
 * that are not .range() paginated — currently the geocode proxy.
 * Returns the parsed (and clamped) value, the default when the
 * parameter is absent/empty, or null when it is malformed.
 */
export function parseLimitParam(
  raw: string | null,
  options: { defaultValue: number; max?: number }
): number | null {
  if (raw === null || raw === '') return options.defaultValue;
  const parsed = parseStrictInteger(raw);
  if (parsed === null || parsed < 1) return null;
  if (options.max !== undefined && parsed > options.max) return options.max;
  return parsed;
}

/** A review rating is an integer NUMBER before it is in range 1..5. */
export function parseRating(value: unknown): FieldParse<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, error: 'Rating must be an integer between 1 and 5' };
  }
  return { ok: true, value };
}

/** A text field is a string before it is stored — never stored verbatim on faith. */
export function parseTextField(value: unknown, field: string): FieldParse<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` };
  }
  return { ok: true, value };
}

/** A string-list field is an array whose every element is a string. */
export function parseStringArray(value: unknown, field: string): FieldParse<string[]> {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    return { ok: false, error: `${field} must be an array of strings` };
  }
  return { ok: true, value: value as string[] };
}
