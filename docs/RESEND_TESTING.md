# Resend Email Service Testing

This guide walks you through testing the Businto email system with Resend as the email service provider.

## Why Test with Resend?

Resend is a modern email service with:
- ✅ **Clean URL Handling**: Doesn't corrupt or wrap claim links
- ✅ **Developer-Friendly**: Test emails without real email setup
- ✅ **Production-Ready**: Can be used directly in production
- ✅ **Good Tracking Support**: Optional tracking without corrupting URLs

## Setup

### 1. Get a Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Go to API Keys section
3. Create a new API key
4. Copy the key (starts with `re_`)

### 2. Configure Environment

Add to your `.env.local`:

```bash
RESEND_API_KEY=re_your_api_key_here
```

Optionally set:
```bash
TEST_EMAIL=your-test-email@example.com
```

**Note:** Resend provides a test email `delivered@resend.dev` for testing without sending to a real address.

## Running Tests

### Quick Test (Single Email)

```bash
npm run test:resend-simple
```

This sends one test email with:
- Claim link: `/claim/TEST123ABC`
- Various internal links
- External links

### Comprehensive Tests (Multiple Scenarios)

```bash
npm run test:resend
```

This sends 3 different email types:
1. **Operator Notification** - Simulates request notification with claim link
2. **Quote Received** - Simulates user quote notification
3. **Multi-Link Test** - Tests various link types in one email

## What to Check

### 1. Email Delivery

After running the test, check:
- If using test email: No real email is sent
- If using real email: Check your inbox

### 2. Link Integrity

**Critical:** Verify claim links are NOT wrapped:

```javascript
// GOOD ✅
https://businto.com/claim/TEST123ABC

// BAD ❌ (Link wrapped by email provider)
https://resend.com/track?url=https%3A%2F%2Fbusinto.com%2Fclaim%2FTEST123ABC&id=...
```

**How to check:**
1. Open the email
2. Right-click the "View Claim" button
3. Click "Inspect Link" or "Copy Link"
4. Paste it and verify the URL is clean
5. Try clicking it to verify it works

### 3. Console Output

The test scripts log:
- ✅ Links found in email
- 📎 Which links are "claim" links vs others
- 📊 Email ID and delivery status
- 🆔 Timestamps

Example output:
```
🎯 CLAIM: https://businto.com/claim/OP123ABC789
🔗 OTHER: https://businto.com/dashboard
🔗 OTHER: https://example.com
```

## Integration with Application

To use Resend in your Next.js app:

### Option 1: Update Email Library (Recommended for Production)

```typescript
// src/lib/email.ts

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmailViaResend({ to, subject, html }: EmailOptions) {
  const response = await resend.emails.send({
    from: FROM_EMAIL,
    to: to,
    subject: subject,
    html: html,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    id: response.data?.id,
    previewUrl: null,
  };
}
```

### Option 2: Keep Current Setup with Resend Fallback

If you want to test Resend without changing your current setup, the test scripts do exactly that - they use Resend independently for testing purposes.

## Troubleshooting

### "RESEND_API_KEY is not set"

Make sure your `.env.local` file has:
```bash
RESEND_API_KEY=re_...
```

### Email Not Received

1. Check spam folder
2. Verify the email address is correct
3. Check Resend dashboard for delivery errors
4. Try using the test email: `delivered@resend.dev`

### Links Are Wrapped

This shouldn't happen with Resend, but if it does:
1. Check that you're using Resend (not another provider)
2. Verify `trackingClicks: false` is set when needed
3. Check Resend dashboard for link tracking settings

## Test Email Data

The test emails use:

**Operator Notification:**
- Service Type: Medical Transport
- Pickup: 123 Main St, Boston MA
- Dropoff: Boston Medical Center
- Date: January 20, 2026

**Quote Received:**
- Operator: Boston Transit Co.
- Price: $145.00
- Vehicle: Wheelchair Accessible Van

**Multi-Link Test:**
- 2 claim links
- 2 internal links
- 1 external link

## Next Steps

1. ✅ Run the test: `npm run test:resend`
2. ✅ Check your email for links
3. ✅ Click links and verify URLs in browser
4. ✅ Check DevTools Network tab for actual URLs
5. ✅ If everything works, consider using Resend in production!

## Reference Links

- [Resend Documentation](https://resend.com/docs)
- [Resend API Reference](https://resend.com/docs/api-reference)
- [Email Link Testing Best Practices](../docs/EMAIL_TESTING.md)
- [Tracking-Resistant Emails](../docs/TRACKING_RESISTANT_EMAILS.md)
