# Resend Email Service Testing - Quick Start Guide

## 🎯 Overview

You now have two comprehensive test scripts ready to validate Resend as an email sender and verify that claim links remain intact without URL corruption.

## 📋 What's Been Created

### Test Scripts

1. **`scripts/test-resend-email.mjs`** - Simple single test
   - Sends one test email with claim links
   - Great for quick validation
   - Command: `npm run test-resend-simple`

2. **`scripts/test-resend-comprehensive.mjs`** - Full test suite
   - 3 different email scenarios
   - Operator notifications
   - User quote emails
   - Multi-link validation
   - Command: `npm run test:resend`

### Documentation

- **`docs/RESEND_TESTING.md`** - Complete setup and troubleshooting guide
- **`scripts/setup-resend-test.sh`** - Interactive setup assistant

### npm Scripts Added

```json
{
  "test:resend": "node scripts/test-resend-comprehensive.mjs",
  "test:resend-simple": "node scripts/test-resend-email.mjs"
}
```

## 🚀 Quick Start

### Step 1: Get Resend API Key

If you don't have one:
1. Go to https://resend.com
2. Sign up (free)
3. Create API key
4. Copy the key (starts with `re_`)

### Step 2: Configure Environment

Add to `.env.local`:
```bash
RESEND_API_KEY=re_your_key_here
```

Optional - set custom test email (otherwise uses Resend's test email):
```bash
TEST_EMAIL=your-email@example.com
```

### Step 3: Run Test

**Quick test:**
```bash
npm run test:resend-simple
```

**Full test suite:**
```bash
npm run test:resend
```

## 🔍 What the Tests Check

✅ **Claim Link Integrity**
- Verifies `/claim/CODE` links are not wrapped
- Tests with real URL patterns from your app
- Checks multiple claim link variations

✅ **Email Delivery**
- Confirms Resend API is working
- Returns message IDs
- Shows successful send confirmations

✅ **Link Variety**
- Tests claim links (most critical)
- Tests internal navigation links
- Tests external links
- Verifies no URL corruption

## 📊 Expected Output

When you run the tests, you'll see:

```
🚀 RESEND EMAIL TEST SUITE
════════════════════════════════════════════════════════

Configuration:
  API Key: ✅ Set
  From: Businto <noreply@businto.com>
  To: delivered@resend.dev
  App URL: https://businto.com

════════════════════════════════════════════════════════

TEST 1/3: Claim Link - Operator Notification
════════════════════════════════════════════════════════
📧 Sending: New Service Request - Businto
✅ Sent successfully!
   Email ID: 61f90d43-0b37-48ae-a8c3-5b39a53d69d1

   📎 Links in email (3):
      🎯 CLAIM: https://businto.com/claim/OP123ABC789
      🔗 OTHER: https://businto.com/dashboard
      🔗 OTHER: https://example.com

[... more tests ...]

📊 TEST SUMMARY
════════════════════════════════════════════════════════
✅ Test 1: Claim Link - Operator Notification
   Message ID: 61f90d43-0b37-48ae-a8c3-5b39a53d69d1
   Links: 3

✅ Test 2: User Quote Received Email
   Message ID: 72a01e54-1c48-59bf-b9d4-6c40b64e70e2
   Links: 2

✅ Test 3: Multi-Link Test
   Message ID: 83b12f65-2d59-60cg-ca05-7d51c75f71f3
   Links: 5

Results: 3/3 tests passed
════════════════════════════════════════════════════════

✅ Next Steps:
1. Check emails at: delivered@resend.dev
2. For live testing, use a real email address (change TEST_EMAIL)
3. Click each link and verify URL integrity
4. Check browser DevTools Network tab for actual link URLs
```

## 🔗 Link Integrity Validation

After sending, verify link integrity:

1. **Open the email** in your inbox
2. **Right-click the button** and select "Inspect Link"
3. **Look at the actual URL**:
   - ✅ GOOD: `https://businto.com/claim/OP123ABC789`
   - ❌ BAD: `https://resend.com/track?url=https%3A%2F%2Fbusinto.com%2F...`

4. **Try clicking the link** - it should work perfectly
5. **Check DevTools** (F12) → Network tab to see the actual URLs being requested

## ⚙️ Configuration Options

### Using a Real Test Email

Edit `.env.local`:
```bash
TEST_EMAIL=your-real-email@gmail.com
```

Then run:
```bash
npm run test:resend
```

Check your gmail inbox for the test emails.

### Using Resend's Test Email (Recommended for CI/CD)

The scripts default to `delivered@resend.dev` which won't actually send emails but will validate delivery success. This is perfect for automated testing.

### Custom App URL

The tests use `https://businto.com` by default. To test with a different URL:

Edit the script files or set in `.env.local`:
```bash
NEXT_PUBLIC_APP_URL=https://dev.businto.com
```

## 🎨 Email Templates in Tests

The tests include realistic email scenarios:

### Test 1: Operator Notification
- Simulates a new service request notification
- Includes claim link for operator to view/quote
- Medical transport example

### Test 2: User Quote Received
- Simulates receiving a quote as a user
- Shows operator details and pricing
- Quote claim link

### Test 3: Multi-Link Validation
- 2 claim links
- 2 internal links (dashboard, requests)
- 1 external link
- Best for comprehensive link testing

## 🐛 Troubleshooting

### Error: "RESEND_API_KEY is not set"

**Solution:** Add to `.env.local`:
```bash
RESEND_API_KEY=re_your_key
```

### Error: "Invalid API key"

**Solution:** 
1. Check key starts with `re_`
2. Verify it's from https://resend.com (not another service)
3. Regenerate the key in Resend dashboard

### Test says "Sent" but no email received

**This is normal!** If using `delivered@resend.dev`, no email is sent (it's Resend's test email). For real email testing, set `TEST_EMAIL` to your actual email.

### Links look wrapped in email

This shouldn't happen with Resend. If it does:
1. Check Resend dashboard settings
2. Make sure tracking isn't enabled
3. Try with a different email provider to compare

## 📈 Next Steps After Testing

### If Tests Pass ✅

1. **Update Email Library** for production use
2. **Add Resend as Primary Provider** in `src/lib/email.ts`
3. **Verify Domain Setup** in Resend (for production)
4. **Remove Brevo** dependency if not needed
5. **Update Environment** variables in production

### If Tests Show Issues ❌

1. Check `docs/RESEND_TESTING.md` for troubleshooting
2. Verify API key validity
3. Check Resend dashboard for errors
4. Review email HTML in scripts for issues
5. Test with a different email address

## 📚 Additional Resources

- **Resend Docs**: https://resend.com/docs
- **Email Testing Guide**: `docs/EMAIL_TESTING.md`
- **Tracking-Resistant Emails**: `docs/TRACKING_RESISTANT_EMAILS.md`
- **Brevo vs Resend Comparison**: See `docs/RESEND_TESTING.md`

## 🎓 Learning Objectives

By running these tests, you'll learn:

✅ How Resend handles claim links (they don't get wrapped!)
✅ How to validate email link integrity
✅ How Resend compares to Brevo for your use case
✅ How to test email services programmatically
✅ Best practices for email testing

## 💡 Pro Tips

1. **Save the Message IDs** from successful sends
2. **Use DevTools** to inspect actual link URLs
3. **Try multiple providers** to compare behavior
4. **Automate this** in your CI/CD pipeline
5. **Monitor Resend dashboard** for delivery analytics

---

Ready to test? Run:
```bash
npm run test:resend
```

Good luck! 🚀
