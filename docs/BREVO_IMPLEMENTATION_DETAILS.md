# Technical Implementation: Brevo Click Tracking Fix

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Email Send Request                            │
│  sendEmail({ to, subject, html, trackingClicks, headers })      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │   Link Validation Layer             │
        │  validateEmailLinks(html)           │
        │  ✓ Format check                     │
        │  ✓ Corruption detection             │
        │  ✓ Length validation                │
        └────────────────────┬────────────────┘
                             │
                    ✅ Valid │ ❌ Invalid
                             │    │
                             │    ▼
                             │  logLinkValidation()
                             │  & throw error
                             │
                             ▼
        ┌────────────────────────────────────┐
        │   Header Construction               │
        │  - X-Mailin-Tag: tracking          │
        │  - X-Mailin-Track-Click: 0 or 1   │
        │    (0 = disabled, 1 = enabled)     │
        └────────────────────┬────────────────┘
                             │
                 ┌───────────┴──────────┐
                 │                      │
            🔐 SMTP             🌐 Brevo API
                 │                      │
                 ▼                      ▼
        ┌─────────────────┐   ┌──────────────────┐
        │ Nodemailer      │   │ fetch() to       │
        │ sendMail()      │   │ api.brevo.com    │
        └─────────┬───────┘   └────────┬─────────┘
                  │                    │
                  └────────┬───────────┘
                           │
                  ✅ Success or ❌ Error
                           │
                           ▼
        ┌────────────────────────────────────┐
        │   Logging & Event Tracking          │
        │  logEmailSend(log)                  │
        │  - Message ID                       │
        │  - Headers sent                     │
        │  - Link count                       │
        │  - Tracking status                  │
        └────────────────────────────────────┘
```

## Module: email-logger.ts

### Core Functions

#### 1. validateEmailLinks(html)
```typescript
Input:  HTML string with links
Output: {
  valid: boolean,
  issues: string[],
  links: Array<{
    original: string,
    isValid: boolean,
    type: 'claim' | 'internal' | 'external',
    isCorrupted: boolean
  }>
}

Detection Pattern Examples:
✓ Valid:      https://businto.com/claim/ABC123
✗ Corrupted:  https://bagihfgi.r.af.d.sendibt2.com/tr/cl/[...]
✗ Corrupted:  Contains .r.sendibt or /tr/cl/ patterns
```

#### 2. logEmailSend(log)
```typescript
Input: EmailSendLog {
  messageId?: string,
  to: string,
  subject: string,
  linkCount: number,
  claimLinkFound: boolean,
  timestamp: string,
  transportType: 'brevo' | 'ethereal' | 'test',
  trackingDisabled?: boolean,
  previewUrl?: string,
  status: 'pending' | 'sent' | 'failed',
  error?: string,
  brevoHeaders?: Record<string, string>
}

Output: 
- Console log with formatted output
- Event log entry (event-logger)
```

#### 3. logLinkValidation(emailTo, validationResult, requestId?)
```typescript
Input:  Email address, validation result, optional request ID
Output: 
- Console error if corrupted links detected
- Event log entry with corruption details
- Reports: link count, corruption count, issues

Example console output:
🔴 LINK CORRUPTION DETECTED
To: operator@company.com
Request: req-12345
Corrupted Links: 1
  - https://bagihfgi.r.af.d.sendibt2.com/tr/cl/[...]
```

#### 4. logBrevoError(error, context)
```typescript
Input:  Error object, context (to, subject, requestId, operatorId)
Output: 
- Console error with full context
- Event log entry with error details
- Captures response body if available

Example console output:
🔴 BREVO SMTP ERROR
To: operator@company.com
Subject: Medical Transportation inquiry
Error Code: 400
Error: Invalid sender email
```

#### 5. inspectBrevoHeaders(headers)
```typescript
Input:  Headers object
Output: {
  trackingStatus: 'DISABLED' | 'ENABLED' | 'DEFAULT',
  hasDisableTrackingHeader: boolean,
  headers: {
    'X-Mailin-Track-Click': string,
    'X-Mailin-Tag': string,
    ...otherHeaders
  }
}

Usage: Verify tracking status before sending
```

## Email Flow Changes

### Before Implementation
```
sendEmail({ to, subject, html, headers })
  ↓
No validation
  ↓
Brevo SMTP (default: X-Mailin-Track-Click: 1)
  ↓
Wraps ALL links in /tr/cl/[UUID] tracking proxy
  ↓
Claim link becomes: .r.af.d.sendibt2.com/tr/cl/[corruption]
  ↓
❌ BROKEN - Operators can't access link
```

### After Implementation
```
sendEmail({ to, subject, html, trackingClicks: false, headers })
  ↓
validateEmailLinks(html)
  ├─ Check format: /claim/...
  ├─ Detect corruption patterns
  ├─ Validate lengths
  └─ Validate code structure
  ↓
✅ Links valid → continue
❌ Links invalid → logLinkValidation() → throw error
  ↓
Construct headers:
  - X-Mailin-Track-Click: 0  ← DISABLES tracking
  - X-Mailin-Tag: transactional-email
  ↓
Send via Brevo SMTP/API
  ↓
✅ NO link wrapping (tracking disabled)
  ↓
Claim link remains clean: https://businto.com/claim/ABC123
  ↓
logEmailSend() → event log
  ↓
✅ WORKING - Operators can access link
```

## Header Strategy

### X-Mailin-Track-Click Header
```
Purpose: Control Brevo's click tracking per email

Values:
  - "0"     = DISABLED (no tracking wrapper)
  - "1"     = ENABLED  (adds /tr/cl/ wrapper)
  - Absent  = DEFAULT  (uses dashboard setting)

When to use "0":
  ✓ Operator notifications with claim links
  ✓ Any email with short tracking-resistant URLs
  ✓ Security-sensitive emails (don't add wrappers)

When to use "1" or absent:
  ✓ User-facing confirmation emails
  ✓ Marketing emails
  ✓ Standard correspondence
```

### Implementation Pattern
```typescript
// In sendEmail() function:
const finalHeaders = {
  ...headers,
  'X-Mailin-Tag': headers?.['X-Mailin-Tag'] || 'transactional-email',
  
  // This is the key line:
  ...(trackingClicks !== undefined 
    ? { 'X-Mailin-Track-Click': trackingClicks ? '1' : '0' } 
    : {}
  ),
};
```

## Validation Rules

### Link Format Validation
```typescript
// ✅ VALID PATTERNS:
const validPatterns = [
  'https://businto.com/claim/ABC123',
  'https://businto.com/claim/a1b2c3d4e5f6',
  'http://localhost:3000/claim/test-code'
];

// ❌ INVALID PATTERNS:
const invalidPatterns = [
  'https://bagihfgi.r.af.d.sendibt2.com/tr/cl/[...]',  // Brevo wrapper
  'https://businto.com/claim/very_very_very_long_code_that_exceeds_limits',
  '/claim/ABC123',  // Missing protocol
  'https://businto.com/quotes/submit?token=...',  // Wrong URL pattern
];
```

### Corruption Detection Algorithm
```typescript
function isCorrupted(url: string): boolean {
  // Pattern 1: Brevo specific domains
  if (url.includes('.r.af.d.sendibt')) return true;
  if (url.includes('.r.sendibt')) return true;
  if (url.includes('/tr/cl/')) return true;

  // Pattern 2: Excessive length (Brevo wrapping adds ~200 chars)
  if (url.length > 500) return true;

  // Pattern 3: Unusual character sequences
  if (/[a-z0-9]{100,}/.test(url)) return true;  // Very long tokens
  if (/[A-Z]{20,}[a-z0-9]{50,}/.test(url)) return true;  // Mixed case unusual sequences
  if (/[_-]{5,}/.test(url)) return true;  // Multiple consecutive separators

  return false;
}
```

## Error Handling Strategy

### Level 1: Pre-Send Validation
```typescript
// In template generation (email.ts):
if (!data.claimLink.includes('/claim/')) {
  throw new Error(`Invalid claim link format: ${data.claimLink}`);
}
// Result: Email never gets sent with invalid link
```

### Level 2: Link Inspection Logging
```typescript
// In sendEmail() function:
const validation = validateEmailLinks(html);
if (!validation.valid) {
  await logLinkValidation(to, validation);
  // Result: Detailed log of any issues found
}
```

### Level 3: API Error Capture
```typescript
// In sendEmailViaApi():
if (!response.ok) {
  console.error('Brevo API Error:', data);
  await logBrevoError(data, { to, subject });
  throw new Error(data.message);
}
// Result: Full Brevo response logged for debugging
```

### Level 4: Event Logging
```typescript
// All errors go to event logger:
await logEvent({
  event_type: 'email.link_corruption_detected' | 'email.send_failed' | 'brevo.smtp_error',
  status: 'error',
  metadata: { detailed info for debugging }
});
// Result: Errors queryable and monitorable
```

## Testing Strategy

### Unit Test: Link Validation
```typescript
test('detects Brevo tracking wrapper', () => {
  const corruptedLink = 'https://bagihfgi.r.af.d.sendibt2.com/tr/cl/xyz';
  const result = validateEmailLinks(`<a href="${corruptedLink}">Click</a>`);
  expect(result.valid).toBe(false);
  expect(result.issues).toContain('Brevo tracking');
});
```

### Integration Test: Email Send with Tracking Disabled
```typescript
test('sends operator email with tracking disabled', async () => {
  const result = await sendEmail({
    to: 'operator@test.com',
    subject: 'Test',
    html: '<a href="https://businto.com/claim/ABC123">Claim</a>',
    trackingClicks: false
  });
  
  // Verify header was set
  expect(result.brevoHeaders['X-Mailin-Track-Click']).toBe('0');
});
```

### E2E Test: Full Request Flow
```typescript
test('operator receives working claim link', async () => {
  // 1. Submit request
  const response = await fetch('/api/requests', {
    method: 'POST',
    body: JSON.stringify({...requestData})
  });
  
  // 2. Check console logs for:
  // ✅ "CLAIM LINK GENERATED"
  // ✅ "EMAIL SEND ATTEMPT ... Tracking: DISABLED"
  // ✅ "EMAIL SENT SUCCESSFULLY"
  
  // 3. Verify email received with clean link
  // (Use email service logs or Ethereal test account)
});
```

## Performance Considerations

### Validation Overhead
```
Per email:
- validateEmailLinks(): ~1-2ms (regex scan of HTML)
- logEmailSend(): ~5-10ms (JSON serialization + event logging)
- Total: ~10ms additional per email

Negligible impact - email delivery takes 100-500ms anyway
```

### Database Impact
```
New event logs per email:
- email.send_success: ~1KB per entry
- email.send_failed: ~1KB per entry
- email.link_corruption_detected: ~2KB per entry (includes link details)

Estimate: 1MB per 1000 emails sent
(Same as any email system with logging)
```

## Monitoring Queries

### Find All Corrupted Links
```sql
SELECT * FROM event_logs 
WHERE event_type = 'email.link_corruption_detected'
ORDER BY created_at DESC
LIMIT 100;
```

### Find Failed Operator Emails
```sql
SELECT * FROM event_logs 
WHERE event_type = 'email.send_failed'
  AND metadata->>'to' LIKE '%@company%'
ORDER BY created_at DESC;
```

### Verify Tracking is Disabled
```sql
SELECT COUNT(*) as count, 
       metadata->>'tracking_disabled' as disabled
FROM event_logs 
WHERE event_type = 'email.send_success'
  AND created_at > NOW() - INTERVAL '1 day'
GROUP BY disabled;
-- Expected: all rows with disabled = true for operator emails
```

## Summary

The fix implements a **layered validation and logging approach**:

1. **Prevention**: Validate links before sending
2. **Protection**: Disable tracking on sensitive emails via headers
3. **Detection**: Catch Brevo's corruption patterns
4. **Logging**: Comprehensive event logging for debugging
5. **Monitoring**: Queryable event logs for alerts

This ensures operators always receive working claim links while maintaining comprehensive error detection and audit trails.
