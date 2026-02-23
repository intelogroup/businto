# Production Readiness Checklist

## ✅ Unit Tests (All Passing)

Run: `npm run test:production`

### Critical Test Suites:
- **Payment Routing Fee** - Ensures $1.99 routing fee model works correctly
- **Marketplace Integrity** - Validates acceptance finality and quote locks
- **Metadata Security** - Prevents PII leaks in API responses
- **API Response Security** - Validates data boundaries

**Status:** ✅ All 37 tests passing

---

## 🔧 Database Migrations

### Required Migrations:
1. `20260117_add_routing_fee_amount.sql` - Adds routing_fee_amount column to bookings
2. `20260117_add_webhook_events.sql` - Creates webhook_events table for idempotency

### Apply:
```bash
supabase db reset
```

**Verification:**
```sql
-- Check routing_fee_amount column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'bookings' AND column_name = 'routing_fee_amount';

-- Check webhook_events table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'webhook_events';
```

---

## 🔐 Environment Variables

### Required:
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# Email (Nodemailer)
EMAIL_HOST=smtp.ethereal.email
EMAIL_PORT=587
EMAIL_USER=xxx@ethereal.email
EMAIL_PASSWORD=xxx
EMAIL_FROM=noreply@businto.com
```

### Verify:
```bash
echo $STRIPE_SECRET_KEY
echo $STRIPE_WEBHOOK_SECRET
echo $SUPABASE_SERVICE_ROLE_KEY
```

---

## 💳 Stripe Configuration

### Webhook Setup:
1. Go to: https://dashboard.stripe.com/webhooks
2. Create endpoint: `https://yourdomain.com/api/payments/webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

### Test Mode:
- Use test API keys (`sk_test_...`, `pk_test_...`)
- Test card: `4242 4242 4242 4242`
- Test refunds with Stripe CLI

---

## 🧪 Manual Testing Checklist

### Payment Flow:
- [ ] Submit request
- [ ] Receive operator quotes
- [ ] Accept quote → See confirmation dialog with "FINAL" warning
- [ ] Payment modal shows **$1.99 routing fee**, not trip cost
- [ ] Trust warning banner visible
- [ ] Payment succeeds
- [ ] Confirmation email shows routing fee breakdown
- [ ] Stripe dashboard shows $1.99 charge (not full trip amount)

### Marketplace Integrity:
- [ ] Accept Quote A
- [ ] Try to accept Quote B → Should fail with 409
- [ ] Try to submit new quote to same request → Should fail with 409
- [ ] Declined quotes stay declined (never auto-reactivate)

### Refund Flow:
- [ ] Submit request and pay routing fee
- [ ] No quotes accepted after 48 hours
- [ ] Trigger auto-refund
- [ ] Verify $1.99 refunded (not trip cost)
- [ ] Refund email received

### Security:
- [ ] API responses never contain `metadata_private`
- [ ] No email/phone/name in `metadata_safe`
- [ ] No exact addresses in public responses
- [ ] Only fuzzy locations visible to operators before acceptance

---

## 🚨 Pre-Launch Blockers

### DO NOT DEPLOY if:
- ❌ Any test suite failing
- ❌ Migrations not applied
- ❌ Webhook secret not configured
- ❌ Payment charging full trip amount instead of $1.99
- ❌ Acceptance allows operator switching
- ❌ Late quotes accepted after request locked
- ❌ PII leaking in API responses

---

## 📊 Monitoring & Alerts

### Key Metrics to Track:
- Payment success rate (should be >95%)
- Refund rate (should be <10%)
- Webhook processing time (should be <2s)
- 409 errors on locked requests (expected, not a bug)
- Duplicate webhook events (should be 0 after idempotency)

### Stripe Dashboard:
- Monitor charge amounts (all should be $1.99)
- Check refund amounts (all should be $1.99)
- Review failed payments
- Verify webhook delivery success rate

---

## 🔄 Rollback Plan

If critical issue discovered:

1. **Immediate:** Disable quote acceptance in UI
2. **Database:** Revert migrations if needed:
   ```sql
   ALTER TABLE bookings DROP COLUMN routing_fee_amount;
   DROP TABLE webhook_events;
   ```
3. **Code:** Git revert to previous stable commit
4. **Stripe:** Disable webhook endpoint temporarily

---

## 📝 Known Limitations (MVP)

- No 1-hour cancellation window (Option B) - acceptance is final
- No automatic operator payout (operators paid separately)
- No live Stripe dashboard for operators
- Email uses Ethereal (test mode) - switch to production SMTP
- No SMS notifications (email only)
- No real-time quote updates via WebSocket (polling + notifications)

---

## ✅ Production Ready Criteria

All checkboxes must be ✅:

- [x] 37 unit tests passing
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Stripe webhook configured
- [ ] Manual payment flow tested
- [ ] Manual marketplace locks tested
- [ ] Manual refund flow tested
- [ ] Security validation passed
- [ ] Monitoring/alerts configured

**Status:** 🟡 Ready for staging environment testing
**Next:** Complete manual testing checklist above
