# Brevo Email Tracking Link Corruption - Solution

## Problem

Operator notification emails were receiving corrupted claim links wrapped by Brevo's click tracking system:

```
https://bagihfgi.r.af.d.sendibt2.com/tr/cl/cl6duIfxEVE61ObhTJ4u8Yw03lTHmd2kn221kG6hligIa1s5vW0APM876rXvzwSK5KxmxgYaqAHLF-xrItoES14FXXHbQLdYipjs-A5Sk9DRDhu0XIe6TGJEf8oFakarV4OvbPW0GWgH60nIL_YFan1pzVA07_B0WXm0bXoO8JRqPiSoFU2OlYvV_OrdOUY7k1xeyq13PPrGqnrQp5urEAs2_0daCQgLijMqaSTgAmcO9cQKMRSeAdRmHF4vrlSArNPXnEARDaJ3NqoCXPNTu9MsoOQGuQDJsweVxcb2N_0B
```

This corruption meant:
- Operators couldn't access the claim link
- Analytics and tracking were broken
- User experience was severely degraded

## Root Cause

Brevo's SMTP server by default wraps all links in emails with its own click tracking proxy (`*.r.af.d.sendibt*.com/tr/cl/...`). This is controlled by the `X-Mailin-Track-Click` header.

For short claim codes (like `/claim/ABC123`), this wrapping corrupts the link because:
1. The tracking wrapper is much longer than the original link
2. The claim code validation fails when the URL structure changes
3. There's no mechanism to unwrap the Brevo tracking on the other end

## Solution Overview

### 1. **Disable Click Tracking for Operator Emails** ✅

We now set `X-Mailin-Track-Click: 0` on all `operatorNewRequest` emails:

```typescript
// Before
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({...})
});

// After
await sendEmail({
  to: operator.company_email,
  ...emailTemplates.operatorNewRequest({...}),
  trackingClicks: false,  // 👈 Disables Brevo click tracking
});
```

**Files Updated:**
- `/src/app/api/requests/route.ts` - Main request handler
- `/src/app/api/cron/process-priority-leaks/route.ts` - Cron job for standard network

### 2. **Comprehensive Error Logging** ✅

Created `/src/lib/email-logger.ts` with:

- **Link Validation**: Detects corrupted/wrapped links before sending
- **Email Send Logging**: Tracks all email operations with metadata
- **Brevo Error Logging**: Captures API errors and response details
- **Claim Link Generation Logging**: Audits all claim code creation

**Key Functions:**
```typescript
validateEmailLinks(html)        // Detects Brevo wrapper patterns
logEmailSend(log)               // Log all email sends with headers
logLinkValidation(email, result) // Log link corruption detection
logBrevoError(error, context)   // Log Brevo API errors
inspectBrevoHeaders(headers)    // Inspect tracking status
```

### 3. **Pre-Send Link Validation** ✅

Added validation in the email template generation:

```typescript
// operatorNewRequest template now validates the claim link:
if (!data.claimLink.includes('/claim/')) {
  throw new Error(`Invalid claim link format: ${data.claimLink}`);
}

if (data.claimLink.includes('.r.af.d.sendibt') || data.claimLink.includes('/tr/cl/')) {
  throw new Error(`Claim link appears to be wrapped by Brevo`);
}

if (data.claimLink.length > 500) {
  console.warn(`Claim link is unusually long (${length} chars)`);
}
```

**Files Updated:**
- `/src/lib/email.ts` - Template validation
- `/src/lib/email-helpers.ts` - Claim link generation & validation

### 4. **Enhanced Brevo Response Logging** ✅

Now captures detailed Brevo API responses:

```typescript
// API response logging
console.log(`[Email/API] Brevo response status: ${response.status}`);
console.log(`[Email/API] Brevo response headers:`, {
  'content-type': response.headers.get('content-type'),
  'x-sib-id': response.headers.get('x-sib-id'),
});
console.log(`[Email/API] Brevo response body:`, JSON.stringify(data, null, 2));
```

## Updated Email Flow

### Before (Corrupted)
```
sendEmail({ to: operator.email, ...data })
  ↓
Brevo SMTP (default: X-Mailin-Track-Click: 1)
  ↓
Adds tracking wrapper to ALL links
  ↓
Operator receives: https://bagihfgi.r.af.d.sendibt2.com/tr/cl/[corruption]
  ❌ Link broken
```

### After (Fixed)
```
sendEmail({ 
  to: operator.email, 
  ...data,
  trackingClicks: false  // 👈 KEY FIX
})
  ↓
Validates claim link format
  ↓
Brevo SMTP with X-Mailin-Track-Click: 0
  ↓
NO tracking wrapper applied
  ↓
Operator receives: https://businto.com/claim/ABC123
  ✅ Link works perfectly
```

## Validation & Monitoring

### Pre-Send Validation
- ✅ Claim link format check
- ✅ Brevo wrapper detection
- ✅ URL length sanity check
- ✅ Code structure validation

### Post-Send Logging
- ✅ Email sent with metadata
- ✅ Brevo API response logged
- ✅ Message ID tracked
- ✅ Errors escalated to event system

### Health Checks
```typescript
// Check Email System Health
POST /api/debug/email-health

// Expected response for operator emails:
{
  "linkValidation": {
    "valid": true,
    "issues": []
  },
  "trackingDisabled": true,
  "brevoHeaders": {
    "X-Mailin-Track-Click": "0"
  }
}
```

## Files Modified

### New Files
- `src/lib/email-logger.ts` - Comprehensive error logging module

### Modified Files
- `src/lib/email.ts` - Added validation, logging, tracking control
- `src/lib/email-helpers.ts` - Added link validation to claim generation
- `src/app/api/requests/route.ts` - Disabled tracking for operator emails
- `src/app/api/cron/process-priority-leaks/route.ts` - Disabled tracking for cron emails

## Testing

### Manual Testing
```bash
# Test operator email with claim link
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "service_type": "medical",
    "pickup_address": "123 Main St, Boston MA 02101",
    "dropoff_address": "55 Fruit St, Boston MA 02114",
    "start_date": "2026-03-15",
    "pickup_fuzzy": "Boston, MA",
    "dropoff_fuzzy": "Cambridge, MA"
  }'

# Check console logs for:
# ✅ "EMAIL SEND ATTEMPT ... Tracking: DISABLED"
# ✅ "CLAIM LINK GENERATED ... Link: https://businto.com/claim/..."
# ✅ "EMAIL SENT SUCCESSFULLY" with message ID
```

### Automated Checks
The email logger will catch and report:
1. ✅ Missing claim links
2. ✅ Brevo tracking wrappers (corruption detected)
3. ✅ Invalid link formats
4. ✅ Unusually long URLs
5. ✅ API failures with full response details

## Key Differences: Operator vs User Emails

| Aspect | Operator Email | User Email |
|--------|---------------|-----------|
| **Tracking** | ❌ Disabled (`trackingClicks: false`) | ✅ Enabled (default) |
| **Link Type** | Short claim links (`/claim/...`) | Long token links |
| **Reason** | Tracking wrapper corrupts claim links | Tracking acceptable for analytics |
| **Failure Mode** | Complete link breakage | Minor UX impact |

## Monitoring & Alerts

Watch for these event logs:
```typescript
// Success - Track these
event_type: 'email.send_success'
event_type: 'claim_link.generated'

// Warning - Investigate these
event_type: 'email.link_corruption_detected'
event_type: 'email.send_failed'
event_type: 'brevo.smtp_error'
```

## Summary of Changes

✅ **Problem**: Brevo's click tracking was corrupting operator claim links
✅ **Root Cause**: Default `X-Mailin-Track-Click: 1` header wrapping all links
✅ **Solution**: Set `X-Mailin-Track-Click: 0` for operator emails
✅ **Validation**: Added comprehensive pre/post-send link validation
✅ **Logging**: Created dedicated error logger with corruption detection
✅ **Monitoring**: All errors now logged to event system for alerting

Operators will now receive clean, working claim links: `https://businto.com/claim/ABC123` ✅
