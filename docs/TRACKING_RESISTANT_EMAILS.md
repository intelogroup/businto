# Tracking-Resistant Email Architecture

## The Problem

**Email providers like Brevo, SendGrid, and Mailchimp wrap links for click tracking:**

```
Your link:
https://businto.com/quotes/submit?request_id=xxx&token=JWT_HERE

Becomes:
http://tracking.provider.com/click/ENCRYPTED_BLOB_THAT_CAN_404
```

**Issues:**
- 🔴 Tracking URLs can 404 (service failures)
- 🔴 Long JWT tokens get corrupted when wrapped
- 🔴 Query parameters are fragile
- 🔴 No control over when tracking is applied
- 🔴 Inconsistent behavior between recipients

## The Solution: Two-Step Token Exchange

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Email Sending                                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Generate short claim code: "ABC123XYZ"                   │
│  2. Store in database with metadata:                         │
│     - resource_id (request ID)                               │
│     - operator_id                                            │
│     - purpose ('quote')                                      │
│     - expires_at (7 days)                                    │
│  3. Email link: https://businto.com/claim/ABC123XYZ          │
│                                                               │
│  ✅ Short, simple URL                                        │
│  ✅ No sensitive tokens in email                             │
│  ✅ Survives tracking wrapping                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘

                            ↓ User clicks link

┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Code Redemption (Server-Side)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. GET /claim/ABC123XYZ                                     │
│  2. Server validates code:                                   │
│     - Exists in database?                                    │
│     - Not expired?                                           │
│     - Not already used?                                      │
│  3. Mark code as used (one-time use)                         │
│  4. Generate JWT token server-side                           │
│  5. Redirect to final destination with token                 │
│                                                               │
│  ✅ Secure server-side validation                            │
│  ✅ One-time use protection                                  │
│  ✅ Audit trail (IP logging)                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Components

### 1. Database Table: `email_claim_codes`

```sql
CREATE TABLE email_claim_codes (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- "ABC123XYZ"
  resource_type TEXT NOT NULL,            -- "operator_quote"
  resource_id UUID NOT NULL,              -- Request ID
  operator_id UUID,
  user_id UUID,
  purpose TEXT NOT NULL,                  -- "quote", "view"
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,                    -- NULL = not used yet
  used_from_ip TEXT,
  email_sent_to TEXT
);
```

**Security Features:**
- ✅ One-time use (tracked via `used_at`)
- ✅ Time-limited expiry
- ✅ IP audit trail
- ✅ Email recipient tracking

### 2. Code Generator: `src/lib/claim-codes.ts`

```typescript
import { createClaimCode } from '@/lib/claim-codes';

const code = await createClaimCode({
  resourceType: 'operator_quote',
  resourceId: requestId,
  operatorId: operator.id,
  purpose: 'quote',
  expiresInMinutes: 10080, // 7 days
  emailSentTo: operator.company_email
});

// Returns: "ABC123XYZ456"
```

**Features:**
- Uses `nanoid` with URL-safe alphabet
- Avoids ambiguous characters (0/O, 1/I/l)
- 12-character codes (2^60 possibilities)
- Collision-resistant

### 3. Redemption Endpoint: `src/app/claim/[code]/route.ts`

```typescript
GET /claim/ABC123XYZ

→ Validates code
→ Generates JWT
→ Redirects to /quotes/submit?token=...
```

**Flow:**
1. Receive claim code
2. Look up in database
3. Validate (not used, not expired)
4. Mark as used
5. Log IP for audit
6. Generate appropriate JWT
7. Redirect to final destination

### 4. Email Helper: `src/lib/email-helpers.ts`

```typescript
import { generateOperatorQuoteLink } from '@/lib/email-helpers';

const link = await generateOperatorQuoteLink(
  requestId,
  operatorId,
  operator.company_email
);

// Returns: "https://businto.com/claim/ABC123XYZ"
```

## Comparison: Old vs New

| Aspect | Old (JWT in URL) | New (Claim Codes) |
|--------|------------------|-------------------|
| **URL Length** | 200+ characters | 40 characters |
| **Tracking Safe** | ❌ No | ✅ Yes |
| **One-Time Use** | ❌ No | ✅ Yes |
| **IP Logging** | ❌ No | ✅ Yes |
| **Expiry Control** | JWT only | Independent |
| **Audit Trail** | Limited | Full |
| **Provider Agnostic** | ❌ No | ✅ Yes |

### Old Method (Vulnerable)
```
Email Link:
https://businto.com/quotes/submit?request_id=33ba1d6d-c5ac-4c21-9fcb-515fa78a9c8d&token=eyJhbGciOiJIUzI1NiJ9.eyJyZXF1ZXN0SWQiOiIzM2JhMWQ2ZC1jNWFjLTRjMjEtOWZjYi01MTVmYTc4YTljOGQiLCJvcGVyYXRvcklkIjoiODcxMjI3OTItZWU2NS00YTI3LWJmMTgtMmUwYWNmZWNlZThiIiwicHVycG9zZSI6InF1b3RlIiwiZXhwIjoxNzczMDczMTYzLCJpYXQiOjE3NzI0NjgzNjN9.k1YHOPpsTdwPAXqRr9Hfe326rTGqYbVLSrdICZOKNLk

Brevo Wraps It:
http://bagihfgi.r.af.d.sendibt2.com/tr/cl/YOBw4p1cL37d6LyMWVVDtdmXnavTZzzMVazQIuzMRHexe6QE4uK...

Result: 404 ❌
```

### New Method (Resistant)
```
Email Link:
https://businto.com/claim/ABC123XYZ456

Brevo May Wrap It:
http://tracking.brevo.com/redirect/SHORT_HASH

Even if Wrapped:
→ Tracking service redirects to: https://businto.com/claim/ABC123XYZ456
→ Your server redeems code
→ Generates JWT server-side
→ Redirects to final destination

Result: Works! ✅
```

## Security Advantages

### 1. **One-Time Use**
```typescript
// First click: Success
GET /claim/ABC123 → Redirects to /quotes/submit

// Second click: Fail
GET /claim/ABC123 → "Link expired or already used"
```

### 2. **Separate Expiry Control**
```typescript
// Claim code: 7 days
createClaimCode({ expiresInMinutes: 10080 })

// JWT after redemption: Can be different (e.g., 30 days)
generateOperatorViewToken(requestId, operatorId, 'quote', 30)
```

### 3. **IP Audit Trail**
```sql
SELECT
  code,
  email_sent_to,
  used_from_ip,
  used_at
FROM email_claim_codes
WHERE operator_id = '...';

-- Track suspicious activity:
-- - Codes used from unexpected IPs
-- - Rapid redemption patterns
-- - Failed redemption attempts
```

## Implementation Checklist

- [x] Database migration (`email_claim_codes` table)
- [x] Claim code generator (`src/lib/claim-codes.ts`)
- [x] Redemption endpoint (`src/app/claim/[code]/route.ts`)
- [x] Email helpers (`src/lib/email-helpers.ts`)
- [ ] Update operator email sending code
- [ ] Update email templates
- [ ] Install `nanoid` package
- [ ] Test claim flow
- [ ] Deploy database migration
- [ ] Add cron job for cleanup

## Testing Guide

### 1. Local Development Test
```bash
# 1. Apply migration
supabase migration up

# 2. Install dependencies
npm install nanoid

# 3. Send test email (use existing test script)
npm run test:operator-email

# 4. Check console for claim link
# Expected: https://businto.com/claim/ABC123XYZ

# 5. Click link
# Should redirect to /quotes/submit?token=...
```

### 2. Production Test
```bash
# 1. Create test request
# 2. Check operator email
# 3. Verify link format: /claim/XXXXX
# 4. Click link
# 5. Verify redirect works
# 6. Click again - should fail (one-time use)
```

### 3. Tracking Simulation
```bash
# Simulate what Brevo does:

# 1. Get claim link from email
CLAIM_URL="https://businto.com/claim/ABC123"

# 2. Wrap it (simulate tracking)
# Brevo would redirect here first, then to your URL

# 3. Final destination
curl -L "$CLAIM_URL"
# Should redirect to /quotes/submit?token=...
```

## Monitoring & Maintenance

### Database Cleanup Cron Job

**File: `src/app/api/cron/cleanup-claim-codes/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredCodes } from '@/lib/claim-codes';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deletedCount = await cleanupExpiredCodes();

  return NextResponse.json({
    success: true,
    deleted: deletedCount,
    timestamp: new Date().toISOString()
  });
}
```

**Vercel Cron Config (`vercel.json`):**
```json
{
  "crons": [{
    "path": "/api/cron/cleanup-claim-codes",
    "schedule": "0 2 * * 0"
  }]
}
```

### Monitoring Queries

```sql
-- Redemption rate
SELECT
  COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS redeemed,
  COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW()) AS pending,
  COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired
FROM email_claim_codes
WHERE created_at > NOW() - INTERVAL '7 days';

-- Failed redemption attempts (check logs)
-- Suspicious patterns: multiple IPs trying same code

-- Popular redemption times
SELECT
  DATE_TRUNC('hour', used_at) AS hour,
  COUNT(*)
FROM email_claim_codes
WHERE used_at IS NOT NULL
GROUP BY hour
ORDER BY hour DESC;
```

## Migration from Old System

### Gradual Rollout Strategy

1. **Week 1: Parallel Operation**
   - Deploy new code
   - Keep old JWT system active
   - Send 10% of emails with claim codes

2. **Week 2: Increase to 50%**
   - Monitor redemption success rate
   - Compare with old system

3. **Week 3: Full Rollout**
   - 100% claim codes
   - Keep old JWT endpoint for backwards compatibility

4. **Week 4: Deprecate Old System**
   - Remove old JWT-in-URL code
   - Keep `/quotes/submit?token=...` working for in-flight emails

## FAQ

**Q: What if users bookmark the claim link?**
A: It's one-time use, so bookmarking won't work. After redemption, they should bookmark the final destination URL.

**Q: Can claim codes be reused?**
A: No. Each code can only be redeemed once. This is a security feature.

**Q: What's the expiry window?**
A: Default is 7 days for operator quotes, 30 days for trip views. Configurable per use case.

**Q: What if Brevo still wraps the short link?**
A: That's fine! The tracking redirect will still point to your domain, and the short code will survive. The key is that the code is in the path (`/claim/ABC`) not query params.

**Q: Performance impact?**
A: Minimal. One extra DB lookup on click (cached), one INSERT on email send. Negligible compared to email delivery time.

## Best Practices

✅ **Do:**
- Use claim codes for all email authentication flows
- Set appropriate expiry times per use case
- Monitor redemption rates
- Log IP addresses for audit
- Clean up expired codes regularly

❌ **Don't:**
- Put sensitive data in claim codes
- Reuse codes across resources
- Skip expiry validation
- Allow unlimited redemption attempts
- Forget to mark codes as used

## Conclusion

This architecture solves the email tracking problem at its root by:
1. **Separating concerns**: Email delivery vs. authentication
2. **Provider agnostic**: Works with any email service
3. **Better security**: One-time use, audit trail, independent expiry
4. **Simpler links**: Shorter, cleaner, more reliable

**Result**: Your authentication flows work reliably regardless of which email provider you use or how they handle link tracking.
