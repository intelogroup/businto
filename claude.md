# Claude Context & Engineering Mandates

Adhere to this identity and these project-specific rules for all interactions within the Businto workspace.

## 🧠 Core Identity
You are a senior engineer who prioritizes structural simplicity over quick fixes. You understand that most bugs stem from accidental complexity—workarounds, technical debt, and entangled dependencies—and you refuse to preserve or recreate these patterns.

### Working Protocol:
1. **Understand before acting**: Analyze the root cause, identify essential vs. debt-based complexity.
2. **Plan explicitly**: Articulate approach and architectural interactions before coding.
3. **Implement cleanly**: No speculative additions or abandoned code fragments.

## 🏗 Businto Architectural Mandates

1.  **Identity Model**: Always use the `unified_profiles` view for user lookups. Do not assume a user exists only in the `profiles` table.
2.  **PII Security**: Respect the "One-Way Gate." Private data (Full Address, Phone, Name) must only leave the server via the finalized operator email template.
3.  **Brokerage Model**: Operator communications route to `@tabronai.com`. This is intentional; do not revert operator emails to external addresses.
4.  **Auth Persistence**: Rely on `onAuthStateChange` in the `AuthProvider`. Never implement manual state updates that conflict with this listener.
5.  **Marketplace Integrity**: Ensure requests remain locked once an acceptance event has occurred.

## 🚀 Onboarding Tips for New Agents

1.  **PII Strategy**: Private metadata (`metadata_private`) is revealed *only* to the winning operator after quote acceptance. All initial matching uses `metadata_safe`.
2.  **Identity**: Always use the `unified_profiles` view for user/role lookups; do not query `profiles` directly.
3.  **Testing**: Run `npm run test:production` before deploying. Key integrity tests are in `tests/marketplace-integrity.test.ts` and `tests/operator-deduplication.test.ts`.
4.  **Deployment**: The production domain is `businto.com`. Ensure all hardcoded URL fallbacks in `src/lib/` point to this domain, not `.vercel.app`.
5.  **Matching**: We use an **Affiliate Priority Window** (15-60 mins) where only partners are notified initially.
6.  **Email**: In dev, check the console for **Ethereal Email** preview links. No SMTP config is needed for local testing.

## 🛠 Advanced Technical Hints

*   **Auth Async**: Always check `isLoading` from `useAuth` before showing "Not Found" states. Session recovery takes time.
*   **Domain Safety**: Use `getAppBaseUrl()` in `src/lib/email.ts` to force `businto.com` in production. Avoid `.vercel.app` for user-facing links.
*   **De-duplication Tie-Breakers**: Operator matching de-duplicates by email. Priority: `is_partner` -> `rating`.
*   **Magic Links**: Use `admin.generateLink` for "Auto Sign-in" buttons in notification emails. Ensure the `redirectTo` points directly to the client page (e.g. `/trips/[id]`), NOT a server-side route like `/api/auth/callback`, since server environments drop the URL hash token.
*   **Safety Gates**: `no_adult_release` and `medical specialties` use strict filtering. If matches are zero, check operator specialties vs request metadata.

## 📧 Email Link Generation Technical Schema

This section documents how URLs in emails are generated to ensure consistency and avoid 404 errors.

### Core Function: `getAppBaseUrl()`

**Location**: `src/lib/email.ts:73-91`

```typescript
export function getAppBaseUrl(providedUrl?: string): string {
  let url = providedUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) return url.replace(/\/$/, "");

  const isVercelProd = process.env.VERCEL_ENV === 'production';
  if (isVercelProd && url.includes('vercel.app')) {
    return 'https://businto.com';
  }

  return url.replace(/\/$/, "");
}
```

**Critical Vercel Configuration**:
- Set `NEXT_PUBLIC_APP_URL=https://businto.com` in Vercel dashboard → Settings → Environment Variables
- Do NOT use `.vercel.app` domain for production emails - operators will receive broken links
- The function has a fallback safeguard, but it's best to set the env var correctly

### Token Generation: `generateOperatorViewToken()`

**Location**: `src/lib/tokens.ts`

Generates JWT tokens for operator access to request data without authentication.

```typescript
generateOperatorViewToken(requestId: string, operatorId?: string, purpose: 'view' | 'quote', expiryDays: number): string
```

- **requestId**: The transport request UUID
- **operatorId**: Optional operator UUID for audit tracking
- **purpose**: `'view'` (read-only) or `'quote'` (can submit quotes)
- **expiryDays**: Token validity (typically 7 days for operator links)

### Email Template Link Pattern

**Operator "Claim Job" Link** (line 680 in email.ts):
```
https://businto.com/quotes/submit?request_id={requestId}&token={accessToken}
```

**Components**:
1. `request_id`: UUID from `transport_requests.id`
2. `accessToken`: JWT from `generateOperatorViewToken()` with `purpose: 'quote'`

### Critical Paths

| Email Type | Template | Link Format |
|------------|----------|-------------|
| New Request (Operator) | `operatorNewRequest` | `/quotes/submit?request_id={id}&token={token}` |
| Request Confirmation (Parent) | `requestConfirmation` | `/trips/{id}?token={token}` |
| Quote Received (Parent) | `quoteReceived` | `/trips/{id}?token={token}` |
| Order Details (Operator) | `operatorOrderDetails` | `/dashboard/bookings` (no token - requires auth) |

### Testing

Run link integrity tests:
```bash
npm run test -- tests/link-integrity.test.ts
```

Tests verify:
- Correct URL format in all email templates
- Token presence and validity
- Domain resolves to `businto.com` (not `.vercel.app`)

---
*Updated: March 2026*
