# Migration Guide: Tracking-Resistant Email Links

## Problem
Brevo and other email providers wrap links with click tracking that:
- Makes URLs extremely long and fragile
- Can return 404 errors when tracking service fails
- Breaks JWT tokens in query parameters

## Solution
Use short claim codes that exchange for tokens server-side.

## Before vs After

### OLD CODE (Vulnerable to Tracking)
```typescript
// In src/app/api/requests/route.ts around line 350

// Generate JWT token
const accessToken = await generateOperatorViewToken(
  data.id,
  operator.id,
  'quote',
  7
);

// Send email with long URL
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({
    // ... other params
    requestId: data.id,
    accessToken,  // Long JWT in email
    appBaseUrl
  })
});

// Template generates:
// https://businto.com/quotes/submit?request_id=xxx&token=eyJhbGciOiJI...LONG_JWT
```

### NEW CODE (Tracking-Resistant)
```typescript
// In src/app/api/requests/route.ts around line 350

import { generateOperatorQuoteLink } from '@/lib/email-helpers';

// Generate short claim code
const claimLink = await generateOperatorQuoteLink(
  data.id,
  operator.id,
  operator.company_email
);

// Send email with short URL
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({
    // ... other params
    requestId: data.id,
    claimLink,  // Short code instead of token
    appBaseUrl
  })
});

// Template generates:
// https://businto.com/claim/ABC123XYZ456
```

## Update Email Template

### OLD Template (src/lib/email.ts line 693)
```html
<a href="${appBaseUrl}/quotes/submit?request_id=${encodeURIComponent(data.requestId)}&token=${encodeURIComponent(data.accessToken)}" class="button">
  Claim Job
</a>
```

### NEW Template
```html
<a href="${data.claimLink}" class="button">
  Claim Job
</a>
```

## Changes Required

### 1. Run Database Migration
```bash
# Apply the claim_codes table migration
supabase migration up
```

### 2. Install nanoid Package
```bash
npm install nanoid
```

### 3. Update Operator Email Code

**File: `src/app/api/requests/route.ts`**

Find this block (around line 350-384):
```typescript
for (const operator of operatorsToNotify) {
  try {
    // Generate signed token for operator access (7 day expiry)
    const accessToken = await generateOperatorViewToken(
      data.id,
      operator.id,
      'quote',
      7
    );

    const emailResult = await sendEmail({
      to: operator.company_email,
      ...emailTemplates.operatorNewRequest({
        // ...
        accessToken,
        appBaseUrl
      })
    });
```

Replace with:
```typescript
import { generateOperatorQuoteLink } from '@/lib/email-helpers';

for (const operator of operatorsToNotify) {
  try {
    // Generate tracking-resistant claim link
    const claimLink = await generateOperatorQuoteLink(
      data.id,
      operator.id,
      operator.company_email
    );

    const emailResult = await sendEmail({
      to: operator.company_email,
      ...emailTemplates.operatorNewRequest({
        // ...
        claimLink,  // Pass link directly, no token
        appBaseUrl
      })
    });
```

### 4. Update Email Template Interface

**File: `src/lib/email.ts`** (around line 562)

Change:
```typescript
operatorNewRequest: (data: {
  operatorName: string;
  // ... other fields
  requestId: string;
  accessToken: string;  // ❌ Remove this
  appBaseUrl?: string;
}) => ({
```

To:
```typescript
operatorNewRequest: (data: {
  operatorName: string;
  // ... other fields
  requestId: string;
  claimLink: string;  // ✅ Add this
  appBaseUrl?: string;
}) => ({
```

### 5. Update Button Link in Template

**File: `src/lib/email.ts`** (around line 693)

Change:
```html
<a href="${appBaseUrl}/quotes/submit?request_id=${encodeURIComponent(data.requestId)}&token=${encodeURIComponent(data.accessToken)}" class="button">
  Claim Job
</a>
```

To:
```html
<a href="${data.claimLink}" class="button">
  Claim Job
</a>
```

## Benefits

✅ **Tracking-Resistant**: Short codes survive email provider wrapping
✅ **One-Time Use**: Codes can only be used once (better security)
✅ **Audit Trail**: Track which IP redeemed each code
✅ **Shorter URLs**: Easier to read, less likely to break
✅ **Expiry Control**: Independent expiry from JWT tokens
✅ **Provider Agnostic**: Works with any email service

## Testing

1. **Send Test Email**:
```typescript
// Test the new claim code flow
const link = await generateOperatorQuoteLink(
  'test-request-id',
  'test-operator-id',
  'test@example.com'
);
console.log('Claim link:', link);
// Should output: https://businto.com/claim/ABC123XYZ456
```

2. **Verify Redemption**:
```bash
# Click the link or curl it
curl -I "https://businto.com/claim/ABC123XYZ456"
# Should redirect to /quotes/submit?request_id=...&token=...
```

3. **Verify One-Time Use**:
```bash
# Click again - should fail
curl -I "https://businto.com/claim/ABC123XYZ456"
# Should redirect to homepage with error
```

## Rollback Plan

If issues arise, you can temporarily:
1. Keep both systems running (old JWT + new claim codes)
2. Add a feature flag to switch between them
3. Monitor redemption success rates

## Database Cleanup

Add a cron job to clean expired codes:

```typescript
// In src/app/api/cron/cleanup-claim-codes/route.ts
import { cleanupExpiredCodes } from '@/lib/claim-codes';

export async function GET(request: NextRequest) {
  const deletedCount = await cleanupExpiredCodes();
  return NextResponse.json({ deleted: deletedCount });
}
```

Run weekly via Vercel Cron or similar.
