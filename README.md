# Businto – Intelligent Dispatch for Private Transport

A high-performance, enterprise-grade transportation marketplace built with AI-powered logistics, automated multi-channel notifications, and a secure multi-role identity architecture.

## 🚀 Current Status: Stable & Verified (Feb 2026)

The platform has been significantly refactored into a **Managed Brokerage Model** with hardened security and robust operator matching.

### ✅ Verified Features & Logic
*   **Split Identity Model**: Clean separation between standard users (`profiles`) and business staff (`operator_profiles`) using a high-performance `unified_profiles` database view for instant role resolution.
*   **Managed Brokerage Routing**: All operator communications are centralized. Partners are routed to `support@tabronai.com` and Standard operators to `sales@tabronai.com`.
*   **One-Way Gate Security**: Hardened PII protection. Customer contact details (Name, Phone, Exact Address) are **revealed only to the winning operator** via a secure email manifest *after* a quote is accepted. Conversely, operator contact details are now revealed to the customer in-app and via email once the booking is confirmed to facilitate direct coordination.
*   **Persistent Auth Guard**: Fixed the "login loop" issue. Implemented auto-redirects for authenticated users and session-first data fetching to eliminate auth flickering.
*   **Robust Operator Matching & De-duplication**: 
    *   **Smart De-duplication**: Prevents notification spam by ensuring each operator company receives only one notification per request, even if they have multiple fleet records.
    *   Integration with **Photon/OpenStreetMap API** for privacy-first address autocomplete.
    *   Local **Haversine Formula** implementation for precise, uncapped distance calculations between requests and operators.
    *   Global Fallback: **Boston Rapid Response Transit** implemented as a 150-mile radius "all-rounder" fallback.
    *   Flexible Specialty Matching: Handles both boolean and stringified metadata (Immediate, Oxygen, Stretcher).
*   **Marketplace Integrity**: Implemented transactional locking on quote acceptance. All losing quotes are permanently declined, and the request is locked to the winning operator (409 Conflict handling).
*   **Security Scanning**: Integrated `secretlint` with Husky pre-commit hooks and GitHub Actions to prevent credential leaks.

## 🛠 Tech Stack
*   **Framework**: Next.js 16 (App Router)
*   **Auth**: Supabase Auth (PKCE Flow) with custom `AuthProvider`
*   **Database**: Supabase (PostgreSQL) with RLS and Split-Metadata architecture
*   **AI**: Vercel AI SDK 4.0 (GPT-4o-mini) for real-time logistics assistance
*   **Email/SMS**: Brevo SMTP & Transactional SMS
*   **Testing**: Vitest (100% pass rate on core integrity/security suites)

## 🏗 Project Structure
```
src/
├── app/              # Next.js App Router (Trips, Auth, Dashboard, API)
├── components/       # Shadcn/ui & Custom Components (QuoteCard, Forms)
├── hooks/            # Custom React Hooks (useAuth, useNotifications)
├── lib/              # Core Logic (Operator Matching, Email, SMS, Maps)
└── types/            # TypeScript Interfaces
tests/                # Vitest Integrity & Security Suite
supabase/             # Migrations & Database Configuration
```

## 🚥 Onboarding Tips for New Agents

-   **PII Security**: Private metadata (`metadata_private`) is revealed *only* to the winning operator after quote acceptance. All initial matching and quoting happens via `metadata_safe`.
-   **Identity Strategy**: Use the `unified_profiles` database view for user/role lookups. Do not query `profiles` directly.
-   **Testing Strategy**: Run `npm run test:production` to verify core marketplace logic, locking, and de-duplication.
-   **Deployment**: The production domain is `businto.com`. Ensure all URL fallbacks in `src/lib/` (email, auth, etc.) point here, not to `.vercel.app`.
-   **Managed Brokerage**: New requests follow an **Affiliate Priority Window** (15-60 mins). Partners are notified first.
-   **Email Testing**: In dev, check the terminal for **Ethereal Email** preview links. No SMTP keys are required for local testing.

## 🚦 Getting Started
1.  **Install**: `npm install`
2.  **Environment**: Ensure `.env.local` contains Supabase, OpenAI, Brevo, and Google Maps keys.
3.  **Test**: `npm run test:production` to verify core logic.
4.  **Dev**: `npm run dev`

i know some of the real features will need real device /network ,real email to test effectivelly, but we need to test with vitest or scripts node maximum possible to ensure that in real life the system will work.

---
© 2026 Businto Logistics.
