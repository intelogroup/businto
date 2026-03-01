# Engineering Mandates & Project Memory

This document serves as the foundational mandate for all AI engineering assistants working on the Businto project. Adhere to these principles strictly.

## 🏗 Core Architectural Principles

1.  **Split Identity Integrity**: Never join directly between `transport_requests` and `operator_profiles` or `profiles` using a single FK. Always use the `unified_profiles` view for lookups to ensure the system recognizes both consumers and business staff seamlessly.
2.  **The "One-Way Gate" (Security)**: Private metadata (PII) must NEVER be exposed via standard API endpoints. It must only be revealed to the winning operator via the `operatorOrderDetails` email template *after* a successful `quote.accepted` event.
3.  **Managed Brokerage Routing**: All operator emails in the database are routed to `support@tabronai.com` or `sales@tabronai.com`. Do not "fix" these to third-party emails unless explicitly instructed. This is the intended brokerage model.
4.  **Marketplace Locking**: Once a quote is accepted, the `transport_request` status must move to `booked` and all other quotes for that request must be set to `declined`. This state is final and immutable.
5.  **Persistence First Auth**: The `AuthProvider` must rely on `onAuthStateChange` as the single source of truth. Always prioritize the active session over temporary tokens to prevent login loops.

## 🚀 Onboarding Tips for New Agents

1.  **PII Gate**: `metadata_private` (Name, Phone, Exact Address) is revealed *only* to the winning operator post-acceptance. Matching uses `metadata_safe`.
2.  **Identity Strategy**: Always use the `unified_profiles` view for role/user resolution.
3.  **Testing Strategy**: Run `npm run test:production` to verify marketplace integrity (locking, de-duplication, URL consistency).
4.  **Deployment**: The production domain is `businto.com`. Ensure all URL fallbacks in `src/lib/` (email, auth, sms) point here.
5.  **Managed Brokerage**: Partners get a 15–60 min "Affiliate Priority Window" before the standard network is notified.
6.  **Email Testing**: In dev mode, check logs for **Ethereal Email** preview links for instant verification.

## 🛠 Advanced Technical Hints

*   **Wait for Auth**: Never fetch data or show errors while `isLoading` is true in `useAuth`.
*   **Force .com Domain**: Background links must use `getAppBaseUrl` to avoid stranded Vercel subdomain sessions.
*   **Dedupe Priority**: Matching de-duplicates by `company_email`. The winning record is chosen via `(is_partner, rating)`.
*   **Auto-Login Emails**: Notification buttons using `supabase.auth.admin.generateLink` must route directly to a client page (e.g. `/trips/[id]`) and NOT a server API route, to preserve the URL hash session token for seamless session recovery.
*   **Safety Thresholds**: Strict matching is enabled for safety-critical flags (`no_adult_release`, `oxygen`, etc). No verified specialty = No match.

## ✅ Verified Project Memories (Feb 2026)

*   **Migration Reconciliation**: Successfully mapped and synchronized local migration timestamps with live Supabase environment (e.g., `20260228161713_marketplace_schema_refactor`).
*   **Logic Fix**: Fixed "Auto Sign-in" broken links from operator quote emails by routing `generateLink` magic links directly to the client instead of the SSR callback, preserving the hash fragment token.
*   **Logic Fix**: Repaired the `findMatchingOperators` engine. Switched to local Haversine distance calculations and verified the **Photon/OpenStreetMap** proxy for geocoding.
*   **Logic Fix**: Implemented a "Persistence Guard" on the Login page to auto-redirect authenticated users, solving the email-link login loop.
*   **Feature**: Implemented **"Boston Rapid Response Transit"** as a global fallback operator with a 150-mile radius and all specialties.
*   **Feature**: Standardized the final "Order Details" email for operators, ensuring full PII (Name, Phone, Raw Address) is shared only upon acceptance.
*   **Security**: Successfully implemented and verified `secretlint` pre-commit hooks and GitHub Actions security scanning. No secrets are inlined in the codebase.
*   **Health (Warning)**: Current pass rate is ~92% (113/123 tests). Security regressions in `transport_requests` RLS and schema-drift in `auth.test.ts` identified for immediate remediation.

## 🚀 Future Roadmap
*   Implement "Shadow User" logic: Auto-create guest profiles for anonymous requesters.
*   Update Cron schedule in `vercel.json` to 15-minute intervals for priority leak processing.
*   Execute Phase 2/3 of UI Standardization (Global enterprise-grade styling).

---
*Updated: Saturday, February 28, 2026*
