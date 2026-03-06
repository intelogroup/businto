# Plan: Wire operator token into quote form submission

## Context
The `/api/quotes` POST handler was recently hardened to extract and verify a signed operator JWT (`token`) from the request body — using it as the authoritative source for `operator_id` and ignoring whatever the body claims. However, the quote submission UI at `src/app/quotes/submit/page.tsx` never sends the token, so the server-side security check is always bypassed and the fallback (trusting `body.operator_id`) is used instead.

The token is already available in the component as `accessToken` (read from the `?token=` URL param at line 44). It just needs to be included in the POST body.

## Change

**File:** `src/app/quotes/submit/page.tsx`

**Location:** `handleSubmit`, line 232.

**What to change:**

Append the token to the fetch body alongside the validated payload:

```ts
// Before
body: JSON.stringify(validation.data),

// After
body: JSON.stringify({ ...validation.data, token: accessToken }),
```

`accessToken` is already in scope (line 44). The token is stripped server-side *before* Zod runs (`const { token, ...quoteBody } = body`), so the client-side `quoteSchema` does not need updating.

## Files to modify
- `src/app/quotes/submit/page.tsx` — line 232 only

## Verification
1. Open a claim link as an operator — confirm redirect to `/quotes/submit?request_id=...&token=...`
2. Submit a quote via the form
3. In server logs, confirm `tokenVerifiedOperatorId` is populated (not null)
4. Confirm a spoofed `operator_id` in the body is ignored in favour of the token-derived one
5. Run `npm run test:production` — no regressions expected
