# Businto — Agent Scope

## In-Scope (agent may fix)
- Security: missing auth checks, unprotected API routes, PII leakage in logs or responses
- Bug fixes with test evidence
- Operator matching logic (Haversine, de-duplication, affiliate priority window)
- Quote lifecycle: creation, locking, acceptance — ensure marketplace integrity
- Email/SMS notification flows via Brevo
- TypeScript type errors (keep at 0)
- Dead code removal

## Out-of-Scope (agent must NOT touch)
- Non-medical transport types — brokerage model is medical-only by design
- Direct payment processing — Businto is a brokerage, not a payment platform
- Changing the `@tabronai.com` operator routing — intentional brokerage model
- Real-time fleet/driver GPS tracking (not in scope of dispatch platform)
- `unified_profiles` view definition — do not alter the view schema
- Files with uncommitted user changes (check git status first)
- Adding new third-party notification channels beyond Brevo

## Test Requirement
Run `npm run test:production` before any deploy. Key tests:
- `tests/marketplace-integrity.test.ts`
- `tests/operator-deduplication.test.ts`

No regressions allowed.
