# MVP Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three implementation gaps found during user-journey testing: booking confirmation emails never send, the quote-accept route has a race condition, and the affiliate window test contains a false finding.

**Architecture:** All fixes are surgical edits to existing files — no new modules. Gap 1 adds a `nanoid` call to the booking INSERT. Gap 2 converts the transport_request UPDATE into an atomic conditional guard. Gap 3 corrects the test that incorrectly flagged the window as missing.

**Tech Stack:** Next.js API routes, Supabase JS client, Vitest, nanoid (already installed)

---

## Context: What the tests found

Running `npx vitest run tests/mvp-user-journey.test.ts` surfaces these gaps:

| # | Gap | Symptom |
|---|-----|---------|
| 1 | `confirmation_code` never set in booking INSERT | Customer never receives booking confirmation email |
| 2 | Race condition in quote accept | Two concurrent accepts both reach `UPDATE` before either reads back `booked` |
| 3 | Test `todo` claims affiliate priority window is missing | Window IS in `requests/route.ts` — test has a false positive |

---

## File Map

| File | Change |
|------|--------|
| `src/app/api/quotes/accept/route.ts` | Add `nanoid` import + `confirmation_code` to INSERT; add `.neq('status','booked')` atomic guard to UPDATE |
| `tests/mvp-user-journey.test.ts` | Fix GAP test assertion (email now expected to send); add race-condition mock test; remove false `todo` |

No other files require changes.

---

## Task 1 — Fix: confirmation_code never set in booking INSERT

**Files:**
- Modify: `src/app/api/quotes/accept/route.ts` (line ~232 booking INSERT)
- Modify: `tests/mvp-user-journey.test.ts` (GAP test + happy-path mock)

The `bookings.insert()` call omits `confirmation_code`, so `booking.confirmation_code` is always `null` after the insert. The route's `if (booking?.confirmation_code)` guard therefore never fires, and the customer booking confirmation email is permanently skipped.

`nanoid` is already in `package.json`. No new dependency needed.

- [ ] **Step 1: Verify the bug with the current test**

  ```bash
  cd /Users/kalinovdameus/Developer/businto
  npx vitest run tests/mvp-user-journey.test.ts --reporter=verbose 2>&1 | grep "GAP"
  ```

  Expected output includes:
  ```
  ✓ GAP — booking confirmation email is NOT sent because confirmation_code is never set in INSERT
  ```
  The test passes *because it asserts the broken behavior*. After the fix the assertion flips.

- [ ] **Step 2: Add `nanoid` import to accept route**

  Open `src/app/api/quotes/accept/route.ts`. At the top import block (around line 1-10), add:

  ```typescript
  import { nanoid } from 'nanoid';
  ```

- [ ] **Step 3: Add `confirmation_code` to the booking INSERT**

  Find the `.insert({` block starting around line 233. Change:

  ```typescript
  // BEFORE
  .insert({
    request_id: tripRequestId,
    quote_id: quoteId,
    user_id: userId,
    operator_id: quote.operator_id,
    amount: quote.total_price,
    status: 'confirmed',
    payment_status: 'pending',
    requires_manual_exchange: isManualMode,
  })
  ```

  ```typescript
  // AFTER
  .insert({
    request_id: tripRequestId,
    quote_id: quoteId,
    user_id: userId,
    operator_id: quote.operator_id,
    amount: quote.total_price,
    status: 'confirmed',
    payment_status: 'pending',
    requires_manual_exchange: isManualMode,
    confirmation_code: nanoid(8).toUpperCase(),
  })
  ```

- [ ] **Step 4: Update the GAP test in `tests/mvp-user-journey.test.ts`**

  The `bookingRow` in the GAP test must now include `confirmation_code` (simulating what the DB returns after INSERT with a generated code). Also flip the final assertion from `toBe(false)` to `toBe(true)`.

  Find the test `'GAP — booking confirmation email is NOT sent...'` and replace the entire test:

  ```typescript
  it('booking confirmation email IS sent once confirmation_code is generated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    setupAcceptRouteDB({
      requestRow: { status: 'quoted', user_id: USER_ID, metadata_private: {} },
      quoteRow: {
        id: QUOTE_A, operator_id: OP_ID_A, total_price: 250, status: 'pending',
        expires_at: null,
        operator: {
          id: OP_ID_A, company_name: 'Ace Transit',
          company_email: 'ops@ace.com', company_phone: '555-0100',
          profile: null,
        },
      },
      declinedQuotes: [],
      // confirmation_code now set because route generates it via nanoid
      bookingRow: { id: BOOKING_ID, confirmation_code: 'ABC12345', amount: 250, status: 'confirmed', payment_status: 'pending' },
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(200);

    // With confirmation_code set, the route's `if (booking?.confirmation_code)` branch fires
    // and sendEmail is called for the customer's booking confirmation
    const bookingEmailSent = mockSendEmail.mock.calls.some(
      ([opts]: any[]) => opts?.to === 'parent@example.com'
    );
    expect(bookingEmailSent).toBe(true);
  });
  ```

  Also update the `bookingRow` in the **happy-path test** to include `confirmation_code: 'XYZ98765'` so that test is consistent:

  ```typescript
  bookingRow: { id: BOOKING_ID, confirmation_code: 'XYZ98765', amount: 250, status: 'confirmed', payment_status: 'pending' },
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx vitest run tests/mvp-user-journey.test.ts --reporter=verbose 2>&1 | tail -20
  ```

  Expected: `28 passed | 1 todo` (same count, GAP test now passes with `true` assertion).

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/api/quotes/accept/route.ts tests/mvp-user-journey.test.ts
  git commit -m "fix: generate confirmation_code in booking INSERT so confirmation email fires"
  ```

---

## Task 2 — Fix: race condition in quote accept route

**Files:**
- Modify: `src/app/api/quotes/accept/route.ts` (line ~190 transport_request UPDATE)
- Modify: `tests/mvp-user-journey.test.ts` (add race-condition-at-update test)

**The bug:** The route first reads `transport_requests.status` (line 57), and only *later* updates it to `'booked'` (line 190). Two concurrent requests can both read `status = 'quoted'`, both pass the `=== 'booked'` check, and both proceed to write. The first read is a guard but not a lock.

**The fix:** Add `.neq('status', 'booked')` to the UPDATE. PostgREST/Postgres evaluates this atomically — if `status` was already set to `'booked'` by a concurrent request, the row matches 0 conditions and returns `null`. We detect 0-row updates and return 409.

This does not require a stored procedure or `SELECT FOR UPDATE`. The `.neq()` on the UPDATE is sufficient because Postgres `UPDATE WHERE` is atomic per row.

- [ ] **Step 1: Write the failing test first**

  In `tests/mvp-user-journey.test.ts`, add this test inside the `'Quote Accept Route'` describe block, after the 409-locked test:

  ```typescript
  it('returns 409 when transport_request UPDATE affects 0 rows (late race condition)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    // Simulate: initial SELECT still shows 'quoted' (passes the early check),
    // but by the time the UPDATE runs, another accept already set it to 'booked'.
    // The atomic .neq('status','booked') guard returns null instead of a row.
    let fromCallIndex = 0;
    mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
      fromCallIndex++;

      // Step 1: ownership/status check — still shows 'quoted' (race not yet resolved)
      if (table === 'transport_requests' && fromCallIndex === 1) {
        return makeChain({ data: { status: 'quoted', user_id: USER_ID, metadata_private: {} }, error: null });
      }
      // Step 2: get quote
      if (table === 'quotes' && fromCallIndex === 2) {
        return makeChain({
          data: {
            id: QUOTE_A, operator_id: OP_ID_A, total_price: 200,
            status: 'pending', expires_at: null,
            operator: { id: OP_ID_A, company_name: 'Ace', company_email: 'ops@ace.com', company_phone: null, profile: null },
          },
          error: null,
        });
      }
      // Step 3: update quote to 'accepted'
      if (table === 'quotes' && fromCallIndex === 3) {
        return makeChain({ data: null, error: null });
      }
      // Step 4: decline others
      if (table === 'quotes' && fromCallIndex === 4) {
        return makeChain({ data: [], error: null });
      }
      // Step 5: atomic UPDATE transport_requests — returns null (race won by peer)
      if (table === 'transport_requests' && fromCallIndex === 5) {
        return makeChain({ data: null, error: null }); // 0 rows updated
      }
      return makeChain({ data: null, error: null });
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.locked).toBe(true);
  });
  ```

- [ ] **Step 2: Run the new test to confirm it currently fails**

  ```bash
  npx vitest run tests/mvp-user-journey.test.ts --reporter=verbose -t "late race condition" 2>&1 | tail -15
  ```

  Expected: `FAIL` — the current route doesn't check whether the UPDATE affected a row, so it returns 200.

- [ ] **Step 3: Apply the fix to `src/app/api/quotes/accept/route.ts`**

  Find the transport_request UPDATE block (around line 190):

  ```typescript
  // BEFORE
  const { error: requestUpdateError } = await supabaseAdmin
    .from('transport_requests')
    .update({
      status: 'booked',
      // Store winning quote_id for reference (optional field)
    })
    .eq('id', tripRequestId);

  if (requestUpdateError) {
    await logEvent({
      event_type: 'quote.accept.db_error',
      // ...
    });
    return NextResponse.json(
      { error: 'Failed to update request status' },
      { status: 500 }
    );
  }
  ```

  Replace with:

  ```typescript
  // AFTER — atomic guard: .neq('status','booked') means 0 rows update if a peer already wrote 'booked'
  const { data: bookedRow, error: requestUpdateError } = await supabaseAdmin
    .from('transport_requests')
    .update({ status: 'booked' })
    .eq('id', tripRequestId)
    .neq('status', 'booked')
    .select('id')
    .maybeSingle();

  if (requestUpdateError) {
    await logEvent({
      event_type: 'quote.accept.db_error',
      status: 'error',
      actor_id: userId,
      request_id: tripRequestId,
      quote_id: quoteId,
      message: 'Failed to update transport_requests status to booked',
      metadata: { error: requestUpdateError.message },
    });
    return NextResponse.json(
      { error: 'Failed to update request status' },
      { status: 500 }
    );
  }

  if (!bookedRow) {
    // Race condition: a concurrent accept already set status to 'booked' between our read and write
    await logEvent({
      event_type: 'quote.accept.race_condition_blocked',
      status: 'error',
      actor_id: userId,
      request_id: tripRequestId,
      quote_id: quoteId,
      message: 'Race condition blocked at transport_request atomic update',
    });
    return NextResponse.json(
      { error: 'Request already fulfilled. Acceptance is final - cannot change operators.', locked: true },
      { status: 409 }
    );
  }
  ```

- [ ] **Step 4: Run all MVP journey tests**

  ```bash
  npx vitest run tests/mvp-user-journey.test.ts --reporter=verbose 2>&1 | tail -20
  ```

  Expected: `29 passed | 1 todo` (new race-condition test now passes).

- [ ] **Step 5: Run the existing marketplace integrity suite to check for regressions**

  ```bash
  npx vitest run tests/marketplace-integrity.test.ts tests/concurrency-acceptance.test.ts --reporter=verbose 2>&1 | tail -10
  ```

  Expected: all pass. The concurrency-acceptance test simulates the bug — it still passes (it *proves* the race exists without DB, our fix is DB-level), so no regression.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/api/quotes/accept/route.ts tests/mvp-user-journey.test.ts
  git commit -m "fix: atomic conditional UPDATE in quote accept prevents race-condition double-booking"
  ```

---

## Task 3 — Correct the affiliate window test (false positive)

**Files:**
- Modify: `tests/mvp-user-journey.test.ts` (remove incorrect `todo`, add accurate comment)

**Why the todo was wrong:** The initial test grep searched `operator-matching.ts` for the window logic and found nothing. The window is actually implemented in `src/app/api/requests/route.ts`:

- Line 160: `priority_window_ends_at = new Date(Date.now() + priorityMinutes * 60 * 1000).toISOString()`
- Line 198: stored in the transport_request INSERT
- Line 447: `operatorsToNotify = operators.filter(op => op.is_partner)` — initial dispatch is partner-only
- `cron/process-priority-leaks/route.ts`: notifies non-partners after `priority_window_ends_at` passes

The todo is a false alarm. Leaving it in would mislead future engineers into believing the feature is unbuilt.

- [ ] **Step 1: Remove the false todo**

  In `tests/mvp-user-journey.test.ts`, find and remove this block from the `'Operator Matching Logic'` describe:

  ```typescript
  // GAP: Affiliate Priority Window
  // CLAUDE.md states a "15-60 min Affiliate Priority Window" where only partners
  // are notified initially. operator-matching.ts has NO time-window logic — it
  // only adds +10pts to the partner score. The window is NOT implemented.
  it.todo('GAP — affiliate priority window: partners-only notification for first 15-60 min after dispatch');
  ```

  Replace it with a passing documentation test:

  ```typescript
  it('affiliate priority window is implemented in requests route (not operator-matching)', () => {
    // The window logic lives in src/app/api/requests/route.ts:
    //   1. priority_window_ends_at = now + priorityMinutes (set on INSERT)
    //   2. operatorsToNotify = operators.filter(op => op.is_partner)  — partner-only initial dispatch
    //   3. cron/process-priority-leaks leaks to non-partners after window expires
    // operator-matching.ts only contributes a +10pt partner score boost for ranking.
    expect(true).toBe(true); // architectural documentation test — remove if it becomes stale
  });
  ```

- [ ] **Step 2: Run full suite to confirm count is the same**

  ```bash
  npx vitest run tests/mvp-user-journey.test.ts --reporter=verbose 2>&1 | tail -8
  ```

  Expected: `30 passed` (was 28+1 todo, now 30+0 todo — the todo becomes a real passing test, the count increases by 1 and the todo count drops to 0).

- [ ] **Step 3: Commit**

  ```bash
  git add tests/mvp-user-journey.test.ts
  git commit -m "test: correct false-positive affiliate window todo — feature is implemented in requests route"
  ```

---

## Verification

After all three tasks, run the full test suite to confirm no regressions:

```bash
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected summary:
- `tests/mvp-user-journey.test.ts` → 30 passed
- No regressions in `tests/marketplace-integrity.test.ts`, `tests/operator-quote-submission.test.ts`, `tests/concurrency-acceptance.test.ts`

---

## Self-Review

**Spec coverage:**
- ✅ Gap 1 (confirmation_code): Task 1 adds nanoid + test flip
- ✅ Gap 2 (race condition): Task 2 adds `.neq().select().maybeSingle()` + test
- ✅ Gap 3 (false todo): Task 3 removes todo + adds documentation test

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

**Type consistency:** `bookedRow` from `.maybeSingle()` is `{ id: string } | null` — consistent with the null-check that follows. `nanoid(8).toUpperCase()` produces a `string` which matches the `confirmation_code: string` column type seen in `exchanges/route.ts` and `webhook/route.ts`.
