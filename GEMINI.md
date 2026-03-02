# Gemini Context & engineering mandates

This document serves as the foundational mandate for all AI engineering assistants working on the Businto project. Adhere to these principles strictly.

## 🏗 Architectural Mandates & Core Principles

1.  **Identity Model**: Always use the `unified_profiles` view for user/role lookups. Do not query `profiles` directly. Never join directly between `transport_requests` and `operator_profiles` or `profiles` using a single FK.
2.  **PII Security (The "One-Way Gate")**: Private data (Full Address, Phone, Name) must NEVER be exposed via standard API endpoints. It must only be revealed to the winning operator via the finalized `operatorOrderDetails` email template *after* a successful `quote.accepted` event (verified via Stripe webhook).
3.  **Brokerage Model**: Operator communications route to `@tabronai.com` (e.g., `support@tabronai.com`). This is the intended brokerage model; do not "fix" these to third-party emails.
4.  **Auth Persistence**: The `AuthProvider` must rely on `onAuthStateChange` as the single source of truth. Always prioritize the active session over temporary tokens to prevent login loops. Never implement manual state updates.
5.  **Marketplace Integrity & Locking**: Once a quote is accepted, the `transport_request` status must move to `booked` and all other quotes for that request must be set to `declined`. This state is final and immutable.

## 🚀 Onboarding Essentials

- **PII Strategy**: `metadata_private` (Name, Phone, Exact Address) is revealed *only* to the winning operator post-acceptance. Matching uses `metadata_safe`.
- **Testing**: Run `npm run test:production` to verify marketplace integrity (locking, de-duplication, URL consistency).
- **Deployment**: Production domain is `businto.com`. All URL fallbacks (email, auth, sms) must point here. Do NOT use `.vercel.app`.
- **Managed Brokerage**: Partners get a 15–60 min "Affiliate Priority Window" before the standard network is notified.
- **Email Testing**: In dev mode, check logs for **Ethereal Email** preview links for instant verification.

## 🛠 Advanced Technical Hints

*   **Wait for Auth**: Never fetch data or show errors while `isLoading` is true in `useAuth`.
*   **Force .com Domain**: Background links must use `getAppBaseUrl` to avoid stranded Vercel subdomain sessions.
*   **Dedupe Priority**: Matching de-duplicates by `company_email`. The winning record is chosen via `(is_partner, rating)`.
*   **Auto-Login Emails**: Notification buttons using `supabase.auth.admin.generateLink` must route directly to a client page (e.g., `/trips/[id]`) and NOT a server API route, to preserve the URL hash session token for seamless recovery.
*   **Safety Thresholds**: Strict matching is enabled for safety-critical flags (`no_adult_release`, `oxygen`, etc). No verified specialty = No match.

## 📧 Email Link Generation

### `getAppBaseUrl()`
**File**: `src/lib/email.ts:73-91`
Forces `businto.com` in production when `VERCEL_ENV === 'production'`.

### `generateOperatorViewToken()`
**File**: `src/lib/tokens.ts`
Generates JWT tokens for operator access without auth.

```typescript
generateOperatorViewToken(requestId: string, operatorId?: string, purpose: 'view' | 'quote', expiryDays: number): string
```

### Link Patterns

| Email | Template | URL Format |
|-------|----------|------------|
| New Request (Operator) | `operatorNewRequest` | `/quotes/submit?request_id={id}&token={token}` |
| Request Confirmation | `requestConfirmation` | `/trips/{id}?token={token}` |
| Quote Received | `quoteReceived` | `/trips/{id}?token={token}` |

## ✅ Verified Project Memories (Feb/March 2026)

*   **Deployment (March 2026)**: Verified `NEXT_PUBLIC_APP_URL` is set to `https://businto.com`. Updated `vercel.json` to daily cron jobs to comply with Hobby plan limits.
*   **Security (CRITICAL)**: Fixed RLS leak on `transport_requests`. Blocked anonymous SELECT access via `Users see own requests_v2` policy. Verified via `tests/database-security.test.ts`.
*   **Logic Fix**: Fixed "Auto Sign-in" broken links by routing `generateLink` magic links directly to the client instead of the SSR callback.
*   **Logic Fix**: Repaired the `findMatchingOperators` engine. Switched to local Haversine distance calculations and verified the **Photon/OpenStreetMap** proxy for geocoding.
*   **Health**: Standardized marketplace test suite. **128/128 tests passing** (100% success rate).

## 🚀 Future Roadmap
*   Implement "Shadow User" logic: Auto-create guest profiles for anonymous requesters.
*   Update Cron schedule in `vercel.json` to 15-minute intervals for priority leak processing (requires Pro plan).
*   Execute Phase 2/3 of UI Standardization (Global enterprise-grade styling).

---
*Updated: March 2, 2026*
