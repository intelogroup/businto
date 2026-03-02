# Brevo Email Link Corruption Fix - Quick Reference

## What Was Wrong?
Operators received broken links in their emails because Brevo's click tracking was wrapping the claim links:
```
❌ CORRUPTED: https://bagihfgi.r.af.d.sendibt2.com/tr/cl/[huge-wrapped-URL]
✅ FIXED:     https://businto.com/claim/ABC123
```

## What Changed?

### 1. Tracking Disabled for Operator Emails
**Before:**
```typescript
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({...})
});
```

**After:**
```typescript
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({...}),
  trackingClicks: false,  // ← KEY CHANGE
});
```

### 2. New Error Logging Module
- **File**: `src/lib/email-logger.ts`
- **Detects**: Corrupted links, invalid formats, Brevo wrapper patterns
- **Logs**: All email operations with full metadata

### 3. Pre-Send Validation
The email template now validates claim links before sending:
```typescript
// These checks happen BEFORE Brevo touches the email:
✅ Link contains /claim/ path
✅ Link doesn't contain Brevo wrapper (r.af.d.sendibt)
✅ Link length is reasonable (<500 chars)
✅ Claim code format is valid
```

### 4. Enhanced Brevo API Logging
Now captures all Brevo responses including:
- ✅ Response status codes
- ✅ Response headers (x-sib-id, content-type)
- ✅ Full response body
- ✅ Error details

## Where Was This Applied?

| Location | Change |
|----------|--------|
| `/src/app/api/requests/route.ts` | `trackingClicks: false` for operator emails |
| `/src/app/api/cron/process-priority-leaks/route.ts` | `trackingClicks: false` for cron operator emails |
| `/src/lib/email.ts` | Added link validation + logging |
| `/src/lib/email-helpers.ts` | Added claim link validation |
| **NEW** `/src/lib/email-logger.ts` | Comprehensive error logging |

## How to Monitor

### Check Console Logs
```
✅ EMAIL SEND ATTEMPT
To: operator@company.com
Subject: Medical Transportation inquiry - Boston, MA
Transport: brevo
Links: 1 found, Claim link: true
Tracking: DISABLED
```

### Check Event Logs
```typescript
// Query for email issues:
SELECT * FROM event_logs 
WHERE event_type LIKE 'email.%' 
  OR event_type LIKE 'brevo.%'
ORDER BY created_at DESC
```

### Key Signals
- ✅ `event_type: 'email.send_success'` - Email sent correctly
- ✅ `event_type: 'claim_link.generated'` - Claim link created
- 🟡 `event_type: 'email.link_corruption_detected'` - Corruption found
- 🔴 `event_type: 'email.send_failed'` - Send failed
- 🔴 `event_type: 'brevo.smtp_error'` - Brevo error

## For Developers

### Adding New Emails with Claim Links

1. **Use the email helper**:
```typescript
import { generateOperatorQuoteLink } from '@/lib/email-helpers';

const claimLink = await generateOperatorQuoteLink(
  requestId,
  operatorId,
  operatorEmail
);
```

2. **Disable tracking**:
```typescript
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.yourTemplate({
    claimLink,
    // ... other data
  }),
  trackingClicks: false,  // ← IMPORTANT!
});
```

3. **Use short URLs only in operator emails**:
- Operator emails: `https://businto.com/claim/ABC123`
- User emails: Can use longer token URLs

### The New Email Logger API

```typescript
import {
  validateEmailLinks,      // Detect corrupted links
  logEmailSend,           // Log email operations
  logLinkValidation,      // Log validation results
  logBrevoError,          // Log Brevo errors
  inspectBrevoHeaders,    // Check tracking status
} from '@/lib/email-logger';

// Example: Validate HTML before sending
const validation = validateEmailLinks(html);
if (!validation.valid) {
  console.error('Link issues detected:', validation.issues);
}
```

## Quick Troubleshooting

### Problem: Links still corrupted?
- [ ] Check `trackingClicks: false` is set on the email
- [ ] Verify `X-Mailin-Track-Click: 0` header is in logs
- [ ] Check email logs for link validation errors

### Problem: Email not sending?
- [ ] Check Brevo API key is configured
- [ ] Check event logs for `brevo.smtp_error`
- [ ] Verify claim link format in template validation

### Problem: Can't see logs?
- [ ] Check console output during email send
- [ ] Check `email-preview-urls.txt` for Ethereal preview
- [ ] Check event logs table for email events

## Testing the Fix

```bash
# Create a test request (operators will receive emails)
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "service_type": "medical",
    "pickup_address": "123 Main St, Boston MA",
    "dropoff_address": "55 Fruit St, Boston MA",
    "start_date": "2026-03-15",
    "pickup_fuzzy": "Boston, MA",
    "dropoff_fuzzy": "Cambridge, MA"
  }'

# Check console for:
# ✅ "CLAIM LINK GENERATED ... Link: https://businto.com/claim/..."
# ✅ "EMAIL SEND ATTEMPT ... Tracking: DISABLED"
# ✅ "EMAIL SENT SUCCESSFULLY" with message ID
```

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Claim Links** | ❌ Wrapped by Brevo tracker | ✅ Clean & working |
| **Operator Experience** | ❌ Broken links | ✅ Working links |
| **Error Detection** | ❌ Silent failures | ✅ Comprehensive logging |
| **Brevo Tracking** | ✅ Enabled (corrupts links) | ❌ Disabled for operator emails |
| **Analytics** | ✅ Available (but broken) | ⚠️ Limited (tracking disabled) |

**Result**: Operators can now claim jobs! 🎉
