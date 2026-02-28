# Engineering Mandates & Project Memory

This document serves as the foundational mandate for all AI engineering assistants working on the Businto project. Adhere to these principles strictly.

## 🏗 Core Architectural Principles

1.  **Split Identity Integrity**: Never join directly between `transport_requests` and `operator_profiles` or `profiles` using a single FK. Always use the `unified_profiles` view for lookups to ensure the system recognizes both consumers and business staff seamlessly.
2.  **The "One-Way Gate" (Security)**: Private metadata (PII) must NEVER be exposed via standard API endpoints. It must only be revealed to the winning operator via the `operatorOrderDetails` email template *after* a successful `quote.accepted` event.
3.  **Managed Brokerage Routing**: All operator emails in the database are routed to `support@tabronai.com` or `sales@tabronai.com`. Do not "fix" these to third-party emails unless explicitly instructed. This is the intended brokerage model.
4.  **Marketplace Locking**: Once a quote is accepted, the `transport_request` status must move to `booked` and all other quotes for that request must be set to `declined`. This state is final and immutable.
5.  **Persistence First Auth**: The `AuthProvider` must rely on `onAuthStateChange` as the single source of truth. Always prioritize the active session over temporary tokens to prevent login loops.

## ✅ Verified Project Memories (Feb 2026)

*   **Logic Fix**: Repaired the `findMatchingOperators` engine. Replaced broken internal geocoding with the verified Google Maps implementation.
*   **Logic Fix**: Implemented a "Persistence Guard" on the Login page to auto-redirect authenticated users, solving the email-link login loop.
*   **Feature**: Implemented **"Boston Rapid Response Transit"** as a global fallback operator with a 150-mile radius and all specialties.
*   **Feature**: Standardized the final "Order Details" email for operators, ensuring full PII (Name, Phone, Raw Address) is shared only upon acceptance.
*   **Security**: Successfully implemented and verified `secretlint` pre-commit hooks and GitHub Actions security scanning. No secrets are inlined in the codebase.
*   **Health**: Verified 100% pass rate on all core Vitest suites (Payment Routing, Marketplace Integrity, Metadata Security, and Auth Persistence).

## 🚀 Future Roadmap
*   Implement "Shadow User" logic: Auto-create guest profiles for anonymous requesters.
*   Update Cron schedule in `vercel.json` to 15-minute intervals for priority leak processing.
*   Execute Phase 2/3 of UI Standardization (Global enterprise-grade styling).

---
*Updated: Saturday, February 28, 2026*
