# 🚀 Resend Testing - Start Here!

## What You Want to Accomplish

✅ Test Resend as an email sender
✅ Verify claim links don't get corrupted
✅ See how it compares to your current Brevo setup
✅ Understand if Resend is better for your needs

## ⏱️ Time Required: 10 minutes

---

## Step 1: Get Resend API Key (2 minutes)

### Go to https://resend.com

1. Click "Sign Up"
2. Create free account (email + password)
3. Click API Keys
4. Create new API key
5. Copy it (looks like: `re_1234567890abcdef`)

### Screenshot Locations:
- API Keys: Dashboard → Left sidebar → "API Keys"
- Create button: Top right "Create API Key"
- Copy button: Next to the key

---

## Step 2: Add to Your Project (1 minute)

### Open `.env.local`

```bash
# Add this line:
RESEND_API_KEY=re_your_key_here

# Optional - change test email:
TEST_EMAIL=your-email@gmail.com
```

### If `.env.local` doesn't exist:
```bash
# Create it in project root
touch .env.local

# Add the API key
echo "RESEND_API_KEY=re_your_key_here" >> .env.local
```

---

## Step 3: Run a Test (1 minute)

### Option A: Quick Test (Recommended First)
```bash
npm run test:resend-simple
```

**What happens:**
- Sends 1 test email
- Shows links found
- Takes ~3 seconds

**Expected Output:**
```
✅ Email sent successfully!
📎 Links in email:
   🎯 CLAIM: https://businto.com/claim/TEST123ABC
   🔗 OTHER: https://businto.com/dashboard
```

---

### Option B: Full Test Suite
```bash
npm run test:resend
```

**What happens:**
- Sends 3 realistic emails
- Operator notification
- User quote email
- Multi-link test
- Takes ~10 seconds

**Expected Output:**
```
✅ Test 1: Claim Link - Operator Notification
✅ Test 2: User Quote Received Email
✅ Test 3: Multi-Link Test

Results: 3/3 tests passed
```

---

### Option C: Compare All Providers
```bash
npm run test:compare-providers
```

**What happens:**
- Tests Resend, Brevo, Ethereal
- Shows link handling for each
- Comparison table
- Takes ~15 seconds

**Expected Output:**
```
Provider          | Link Wrapping | Tracking Method
────────────────────────────────────────────────────
Resend            | ❌ No         | Hidden pixels
Brevo SMTP        | ⚠️ Yes        | URL wrapping
Ethereal          | ❌ No         | None
```

---

## Step 4: Verify Your Links (2 minutes)

### Check if using test email (delivered@resend.dev):
- ✅ No actual email sent (it's Resend's test address)
- ✅ Results show in console only
- ✅ Perfect for automated testing

### Check if using real email:
1. Open your email inbox
2. Find emails from `noreply@businto.com`
3. Right-click the buttons/links
4. Click "Copy link" or "Inspect link"
5. Paste and check URL:
   - ✅ Should be: `https://businto.com/claim/...`
   - ❌ Should NOT be: `https://resend.com/track?url=...`

---

## Step 5: Read Results (2 minutes)

### Test Output Meanings

#### ✅ SUCCESS
```
✅ Email sent successfully!
   Email ID: 61f90d43-0b37-48ae-a8c3-5b39a53d69d1
   Links: 3 found
```
→ Everything worked! Check email.

#### 🎯 CLAIM LINK FOUND
```
🎯 CLAIM: https://businto.com/claim/TEST123ABC
```
→ Claim link is in email and not wrapped!

#### 🔗 OTHER LINKS
```
🔗 OTHER: https://businto.com/dashboard
```
→ Other links also clean and working.

#### ❌ ERROR
```
❌ RESEND_API_KEY is not set in .env.local
```
→ Check Step 2 above.

---

## 📊 Understanding the Results

### What "Link Wrapping" Means

**GOOD (Resend) ✅**
```
Email contains:
<a href="https://businto.com/claim/ABC123">
User clicks: https://businto.com/claim/ABC123
```
→ User goes directly to your site. Perfect!

**BAD (Some providers) ❌**
```
Email contains:
<a href="https://provider.com/track?url=https%3A%2F%2Fbusinto.com%2Fclaim%2FABC123">
User clicks: https://provider.com/track?...
Then: provider logs click
Then: redirects to: https://businto.com/claim/ABC123
```
→ Extra hop and URL corruption. Bad for claim links!

**RESEND RESULT ✅**
- No wrapping = clean URLs
- No extra tracking params
- Direct navigation
- Perfect for claim links!

---

## 🎯 Key Questions Answered

### Q: Do Resend links get wrapped?
**A:** ❌ No! Resend preserves URLs exactly as written.

### Q: How does Resend track emails?
**A:** Hidden pixels, not URL modification. Your links stay clean.

### Q: Is Resend reliable?
**A:** ✅ Yes! Modern service, good uptime, recommended for production.

### Q: Is it free?
**A:** ✅ Free tier available (good for testing and small volume).

### Q: How does it compare to Brevo?
**A:** Resend = cleaner URLs, Brevo = URL wrapping (needs header to disable).

---

## 🚀 Quick Command Reference

```bash
# Show all npm test commands available
npm run

# Quick test (1 email, 3 seconds)
npm run test:resend-simple

# Full test (3 emails, 10 seconds)
npm run test:resend

# Compare all providers (all 3, 15 seconds)
npm run test:compare-providers

# Read documentation
cat docs/RESEND_TESTING.md
cat RESEND_TEST_QUICK_START.md
```

---

## ⚡ Most Common Flow

```
1. npm run test:resend-simple
                    ↓
   (Tests run, shows success)
                    ↓
2. Check console output for links
                    ↓
3. (Optional) Check email if using real TEST_EMAIL
                    ↓
4. Verify links are clean (not wrapped)
                    ↓
5. Done! ✅
```

---

## 🎓 What You'll Learn

After running these tests, you'll know:

✅ If Resend preserves your claim links
✅ How URL wrapping works (and why it matters)
✅ How Resend compares to Brevo
✅ How to test email providers
✅ Whether to switch to Resend for production

---

## 📚 Need More Information?

**Quick questions?** → Read: `RESEND_TEST_QUICK_START.md`

**Step-by-step setup?** → Read: `docs/RESEND_TESTING.md`

**File inventory?** → Read: `FILES_CREATED.md`

**This overview?** → Read: `RESEND_TESTING_SUMMARY.md`

---

## ✅ Before You Start - Checklist

- [ ] You have internet access
- [ ] You have 10 minutes
- [ ] You know your project's `/path/to/businto`
- [ ] You have `npm` installed

**Optional:**
- [ ] You have a personal email to test with
- [ ] You have VS Code or text editor open

---

## 🎬 Let's Go!

### Copy-Paste Ready Command

**First Time Setup:**
```bash
# 1. Create/open .env.local
# 2. Add: RESEND_API_KEY=re_your_key
# 3. Run this:
npm run test:resend-simple

# 4. Watch the output
# 5. Check results!
```

**Then try the full test:**
```bash
npm run test:resend
```

**Then compare providers:**
```bash
npm run test:compare-providers
```

---

## 🎉 That's It!

You're all set to test Resend. Just:

1. Get API key (2 min)
2. Add to .env.local (1 min)
3. Run test (1 min)
4. Check results (2 min)
5. Done! ✅

**Total time: 10 minutes**

---

## 🆘 Stuck?

**API key error?**
→ Check step 2 above

**Script won't run?**
→ Make sure `npm run test:resend-simple` is exactly correct

**No email received?**
→ You might be using test email (delivered@resend.dev). That's OK!

**Links look wrapped?**
→ This shouldn't happen with Resend. Check `docs/RESEND_TESTING.md`

---

## 🚀 Ready?

Go ahead! Run:

```bash
npm run test:resend-simple
```

Let's see how Resend handles your claim links! 🎯

---

**Questions?** See the detailed guides:
- `RESEND_TEST_QUICK_START.md` - Quick reference
- `docs/RESEND_TESTING.md` - Complete guide
- `RESEND_TESTING_SUMMARY.md` - File overview
