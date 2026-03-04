# Plan: Manual Dispatch — Full Brokered Flow

## Context

The current "Manual Dispatch" toggle only skips auto-operator emails. The intended behavior is a fully brokered flow:
1. Admin receives the request (no operator emails)
2. Admin picks an operator and enters price → creates a quote on their behalf → user is notified
3. User accepts the quote → booking is created BUT user PII is NOT auto-sent to operator
4. Admin manually triggers PII exchange from the admin panel

This ensures the admin controls both sides of the connection at every step.

---

## Required Changes

### 1. Apply Existing Migration (Blocker)
`supabase/migrations/20260303000001_add_app_settings.sql` is untracked and not applied. The toggle silently fails without the `app_settings` table. Apply via Supabase MCP first.

---

### 2. New Migration — Add `requires_manual_exchange` to `bookings`

New file: `supabase/migrations/20260304000001_add_manual_exchange_flag.sql`

```sql
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requires_manual_exchange BOOLEAN DEFAULT FALSE;
```

---

### 3. Flag Requests Created During Manual Mode

**File:** `src/app/api/requests/route.ts` — manual dispatch branch (~line 288)

After the request is inserted and `dispatchSetting?.value === true`, update `metadata_private`:

```ts
await supabaseAdmin
  .from('transport_requests')
  .update({
    metadata_private: { ...metadata_private, requires_manual_allocation: true }
  })
  .eq('id', data.id);
```

Effect: request immediately appears in the Safety Valve tab.

---

### 4. New Dispatch Action — `create_quote`

**File:** `src/app/api/master/admin/dispatch/route.ts`

Add handler for `body.action === 'create_quote'`:

```
body: { requestId, operatorId, price, vehicleType, note? }
```

Logic:
1. Fetch request and operator (validate both exist)
2. Insert into `quotes`: `{ request_id, operator_id, total_price, vehicle_type, note, status: 'pending' }`
3. Update `transport_requests.status = 'quoted'`
4. Send `quoteReceived` email to the user (look up email from `unified_profiles`)
5. `logEvent({ event_type: 'quote.admin_created', ... })`
6. Return `{ success: true, quoteId }`

Reuses existing `emailTemplates.quoteReceived` and `supabaseAdmin`.

---

### 5. New Dispatch Action — `send_operator_details`

**File:** `src/app/api/master/admin/dispatch/route.ts`

Add handler for `body.action === 'send_operator_details'`:

```
body: { bookingId }
```

Logic:
1. Fetch booking → quote → operator → transport_request → `unified_profiles` (user PII)
2. Send `operatorOrderDetails` email to `operator.company_email`
3. Update `bookings.requires_manual_exchange = FALSE`
4. `logEvent({ event_type: 'admin.pii_exchange.sent', ... })`
5. Return `{ success: true, sentTo: operator.company_email }`

Reuses existing `emailTemplates.operatorOrderDetails`.

---

### 6. Block Auto PII Email on Acceptance in Manual Mode

**File:** `src/app/api/quotes/accept/route.ts` (~line 315)

After creating the booking, check manual mode:

```ts
const { data: dispatchSetting } = await supabaseAdmin
  .from('app_settings').select('value')
  .eq('key', 'manual_dispatch_mode').maybeSingle();

const isManual = dispatchSetting?.value === true;

if (isManual) {
  // Mark booking for manual exchange
  await supabaseAdmin.from('bookings')
    .update({ requires_manual_exchange: true })
    .eq('id', booking.id);

  // Notify admin
  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'jimkalinov@gmail.com',
    subject: `[Businto] Booking Confirmed — PII Exchange Pending #${booking.id.slice(0, 8)}`,
    html: `<p>User accepted quote. Please send user details to the operator from the admin panel.</p>
           <p><a href="${appBaseUrl}/master/admin">Open Admin Panel</a></p>`,
  });
} else {
  // Existing auto flow: send operatorOrderDetails email
  await sendEmail({ to: ..., ...emailTemplates.operatorOrderDetails({...}) });
}
// bookingConfirmation to user always fires in both modes (no PII)
```

---

### 7. Admin UI — Dispatch Modal (Manual Mode)

**File:** `src/app/master/admin/page.tsx` — Dispatch Modal

When `manualDispatchMode === true`, show "Create Quote" form instead of "Send Notification":

- Keep operator selector (existing + new operator forms)
- Add fields: `Price ($)`, `Vehicle Type`, `Note (optional)`
- Button changes from "Send Notification" → "Create Quote"
- On submit: calls `create_quote` action
- Success notification: "Quote created — user has been notified"

When `manualDispatchMode === false`, existing "Send Notification" behavior is unchanged.

---

### 8. Admin UI — Pending PII Exchange Section

**File:** `src/app/master/admin/page.tsx`

Add new state + fetch:
```ts
const [pendingExchanges, setPendingExchanges] = useState([]);
// fetch from new GET /api/master/admin/exchanges or query bookings directly
```

Add a new tab or section in Safety Valve: **"Pending PII Exchange"**

Columns: Request ID | User | Operator | Accepted At | Action
Action button: "Send user info → operator" → calls `send_operator_details`

Add badge count to tab when `pendingExchanges.length > 0`.

Alternatively (simpler): add this table directly inside the Safety Valve tab as a second section below the manual allocation queue.

---

### 9. New API Route — Get Pending Exchanges

**File:** `src/app/api/master/admin/exchanges/route.ts` (new)

```
GET /api/master/admin/exchanges
```

```ts
const { data } = await supabaseAdmin
  .from('bookings')
  .select(`
    id, created_at,
    transport_requests ( id, service_type, pickup_fuzzy, dropoff_fuzzy, user_id ),
    quotes ( operator_id, total_price, vehicle_type,
      operators ( company_name, company_email ) )
  `)
  .eq('requires_manual_exchange', true)
  .order('created_at', { ascending: false });
```

Returns array of bookings with nested request + operator info.

---

### 10. Toggle UX Fixes

**File:** `src/app/master/admin/page.tsx`

- **Error handling**: add `addNotification({ type: 'error', ... })` on `!res.ok` and in catch block
- **Label clarity**: change `"Auto Matching"` → `"Auto: ON"` and `"Manual Dispatch"` → `"Manual: ON"`
- **Safety Valve description**: update to *"Requests awaiting manual dispatch — timed out, passed by operators, arrived while auto-matching was OFF, or pending PII exchange."*

---

## Critical Files

| File | Change |
|------|--------|
| `supabase/migrations/20260303000001_add_app_settings.sql` | Apply (MCP) |
| `supabase/migrations/20260304000001_add_manual_exchange_flag.sql` | New migration |
| `src/app/api/requests/route.ts` | Set `requires_manual_allocation` when manual mode ON |
| `src/app/api/master/admin/dispatch/route.ts` | Add `create_quote` + `send_operator_details` actions |
| `src/app/api/quotes/accept/route.ts` | Block PII email in manual mode, set `requires_manual_exchange` |
| `src/app/api/master/admin/exchanges/route.ts` | New — pending exchange list |
| `src/app/master/admin/page.tsx` | Dispatch modal, exchange section, toggle fixes |

## Reused Functions

- `emailTemplates.quoteReceived` — notify user of admin-created quote
- `emailTemplates.operatorOrderDetails` — send user PII to operator (manual trigger)
- `emailTemplates.bookingConfirmation` — still auto-fires to user on acceptance
- `logEvent` — event logging throughout
- `requireAdmin` — auth guard on all new routes
- `supabaseAdmin` — service role client

---

## Verification

1. Apply migrations → confirm `app_settings` and `bookings.requires_manual_exchange` exist
2. Toggle Manual ON → submit new request → confirm it appears in Safety Valve, no operator emails sent
3. Admin creates quote via modal → confirm `quotes` row created, user receives `quoteReceived` email
4. User accepts quote → confirm `bookingConfirmation` sent to user, `operatorOrderDetails` NOT sent, `requires_manual_exchange = true` on booking, admin notified
5. Admin clicks "Send user info → operator" → confirm `operatorOrderDetails` email sent, `requires_manual_exchange` cleared
6. Toggle error: kill network mid-toggle → confirm error notification in admin UI
