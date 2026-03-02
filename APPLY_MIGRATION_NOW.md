# 🚨 CRITICAL: Apply Database Migration to Production

The claim code system is **deployed but the database table is missing**.

## Quick Fix (5 minutes)

### Option 1: Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard/project/expwyvyphwlyhwrzdmmv
   - Navigate to: **SQL Editor**

2. **Run this SQL**

   Copy and paste the entire contents of:
   `supabase/migrations/20260302100000_add_email_claim_codes.sql`

   Or copy this directly:

```sql
-- Email Claim Codes: Short-lived codes for secure email link authentication
-- Prevents email tracking services from breaking long JWT tokens in URLs

CREATE TABLE IF NOT EXISTS public.email_claim_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Short alphanumeric code (e.g., "ABC123XYZ")
  code TEXT UNIQUE NOT NULL,

  -- What this code grants access to
  resource_type TEXT NOT NULL, -- 'operator_quote', 'trip_view', 'password_reset'
  resource_id UUID NOT NULL,   -- Request ID, Trip ID, User ID, etc.

  -- Authorization context
  operator_id UUID,            -- If this is for an operator
  user_id UUID,                -- If this is for a user
  purpose TEXT NOT NULL,       -- 'quote', 'view', 'reset_password'

  -- Security
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,         -- Null = not used yet
  used_from_ip TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  email_sent_to TEXT           -- Track which email received this code
);

-- Index for fast lookup by code
CREATE INDEX idx_email_claim_codes_code ON public.email_claim_codes(code)
WHERE used_at IS NULL;

-- Auto-delete expired codes after 30 days
CREATE INDEX idx_email_claim_codes_expires ON public.email_claim_codes(expires_at);

-- RLS: Codes are redeemed server-side only, no direct client access
ALTER TABLE public.email_claim_codes ENABLE ROW LEVEL SECURITY;

-- No policies needed - server-side only access via service role

COMMENT ON TABLE public.email_claim_codes IS
'Short-lived claim codes for email links. Prevents tracking services from breaking auth tokens.';
```

3. **Click "Run"**

4. **Verify table was created**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'email_claim_codes';
   ```

   Should return 1 row.

### Option 2: Supabase CLI

```bash
# From project directory
cd /Users/kalinovdameus/Developer/businto

# Repair migration history
supabase migration repair --status applied 20260302100000

# Or manually execute
supabase db execute --file supabase/migrations/20260302100000_add_email_claim_codes.sql
```

## Why This is Critical

**Current State:**
- ✅ Code deployed to Vercel
- ❌ Database table missing
- ❌ Operator emails will FAIL when trying to create claim codes

**Impact:**
- Every new transport request will error
- Operators won't receive job notifications
- Email system is broken until this is fixed

## Verification

After applying migration, test:

```bash
npm run test:production-claim
```

Or check in Supabase:

```sql
-- Should return the new table structure
\d public.email_claim_codes;

-- Or
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'email_claim_codes';
```

## Rollback (if needed)

```sql
DROP TABLE IF EXISTS public.email_claim_codes CASCADE;
```

Then revert code to previous commit:
```bash
git revert HEAD~2
git push origin main
```

---

**⚠️ DO THIS NOW before any new transport requests are created!**
