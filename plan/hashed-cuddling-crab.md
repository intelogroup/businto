# Plan: Fix Admin Page — Manual Dispatch Quote Fields + Pending PII Exchange UI

## Context
The backend for manual dispatch (brokered flow) is fully implemented. Two critical UI gaps
in `src/app/master/admin/page.tsx` prevent the feature from working end-to-end:

1. **Gap 1**: The dispatch modal shows the operator selector when `manualDispatchMode === true`
   but never renders the quote form fields (`price`, `vehicleType`, `note`), causing
   `handleSendDispatch` to always reject with "Price and vehicle type are required".
   The submit button also always says "Send Email" instead of "Create Quote".

2. **Gap 2**: `pendingExchanges` state and `handleSendExchange` are wired up but the
   Pending PII Exchange table is never rendered in the Safety Valve tab.

3. **Gap 3 & 4** (minor): Safety Valve tab badge and description don't account for
   `pendingExchanges`.

## Only file modified
`src/app/master/admin/page.tsx`

---

## Change 1 — Dispatch modal: render quote form fields in manual mode

**Location**: lines 583–679 (the existing-operator block inside the dispatch modal)

After the `<select>` for operator (lines 586–597), add a conditional block that renders
when `manualDispatchMode === true`. This goes inside the `dispatchMode === 'existing'` branch,
after the operator select and before the `) : (` divider for the new-operator form:

```tsx
{manualDispatchMode && (
  <div className="space-y-3 mb-4">
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1">Price ($) *</label>
      <input
        type="number"
        placeholder="e.g. 250"
        value={quoteForm.price}
        onChange={(e) => setQuoteForm(f => ({ ...f, price: e.target.value }))}
        className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-indigo-500 outline-none"
      />
    </div>
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1">Vehicle Type *</label>
      <select
        value={quoteForm.vehicleType}
        onChange={(e) => setQuoteForm(f => ({ ...f, vehicleType: e.target.value }))}
        className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-indigo-500 outline-none"
      >
        {['school_bus', 'mini_bus', 'coach', 'van', 'sedan'].map(vt => (
          <option key={vt} value={vt}>{vt.replace('_', ' ')}</option>
        ))}
      </select>
    </div>
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1">Note (optional)</label>
      <textarea
        placeholder="e.g. Price includes fuel surcharge"
        value={quoteForm.note}
        onChange={(e) => setQuoteForm(f => ({ ...f, note: e.target.value }))}
        rows={2}
        className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
      />
    </div>
  </div>
)}
```

**Also fix submit button label** at line 677:
```tsx
// Before:
{dispatchMode === 'new' ? 'Create & Dispatch' : 'Send Email'}

// After:
{manualDispatchMode ? 'Create Quote' : dispatchMode === 'new' ? 'Create & Dispatch' : 'Send Email'}
```

---

## Change 2 — Safety Valve tab: badge + description

**Badge** (line 714–718): count both queues:
```tsx
{(criticalRequests.length + pendingExchanges.length) > 0 && (
  <span ...>{criticalRequests.length + pendingExchanges.length}</span>
)}
```

**Header count** (line 826): `{criticalRequests.length + pendingExchanges.length} alerts`

**Description** (line 822):
`"High-priority rides requiring human intervention, and bookings awaiting manual PII exchange."`

---

## Change 3 — Safety Valve tab: add Pending PII Exchange card

After the closing `</Card>` of the Manual Allocation Queue (after line 890, before
`</TabsContent>`), add:

```tsx
<Card className="border-none shadow-sm bg-white rounded-lg overflow-hidden mt-4">
  <CardHeader className="p-5 pb-4 border-b border-neutral-50">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-50 text-amber-600 rounded">
          <ArrowRight size={15} />
        </div>
        <div>
          <CardTitle className="text-base font-semibold text-neutral-900">Pending PII Exchange</CardTitle>
          <CardDescription className="text-sm mt-0.5">
            Accepted bookings where the operator's full contact details haven't been sent yet.
          </CardDescription>
        </div>
      </div>
      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded">
        {pendingExchanges.length} pending
      </span>
    </div>
  </CardHeader>
  <CardContent className="p-0">
    {loadingExchanges ? <TableLoader /> : pendingExchanges.length === 0 ? (
      <div className="flex flex-col items-center py-14 text-center">
        <Mail className="text-neutral-200 mb-3" size={24} />
        <p className="text-sm font-medium text-neutral-500">No pending exchanges</p>
        <p className="text-xs text-neutral-400 mt-1">All operator PII has been sent.</p>
      </div>
    ) : (
      <ScrollArea className="h-[350px]">
        <div className="px-6 pb-6">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
              <tr className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                <th className="text-left py-3">Booking</th>
                <th className="text-left py-3">Route</th>
                <th className="text-left py-3">Operator</th>
                <th className="text-left py-3">Accepted</th>
                <th className="text-right py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {pendingExchanges.map((ex) => (
                <tr key={ex.id} className="hover:bg-amber-50/20 transition-colors">
                  <td className="py-4">
                    <span className="text-sm font-semibold text-neutral-900">
                      #{ex.confirmation_code || ex.id.substring(0, 8)}
                    </span>
                    <p className="text-xs text-neutral-500 mt-0.5 capitalize">
                      {ex.transport_requests?.service_type?.replace('_', ' ')}
                    </p>
                  </td>
                  <td className="py-4">
                    <p className="text-xs text-neutral-600">{ex.transport_requests?.pickup_fuzzy}</p>
                    <p className="text-xs text-neutral-400">→ {ex.transport_requests?.dropoff_fuzzy}</p>
                  </td>
                  <td className="py-4">
                    <p className="text-sm text-neutral-800">{ex.operators?.company_name}</p>
                    <p className="text-xs text-neutral-400">{ex.operators?.company_email}</p>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Clock size={12} />
                      {formatTime(ex.created_at)}
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <Button
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-700 gap-1.5"
                      disabled={sendingExchange === ex.id}
                      onClick={() => handleSendExchange(ex.id)}
                    >
                      {sendingExchange === ex.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Send size={11} />}
                      Send PII
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    )}
  </CardContent>
</Card>
```

---

## Verification

1. Toggle Manual Dispatch ON in admin panel
2. Open dispatch modal on any live request → confirm Price / Vehicle Type / Note fields appear
3. Fill fields + select operator → click "Create Quote" → success notification, request refreshes
4. Simulate an accepted booking with `requires_manual_exchange: true`
5. Safety Valve tab → Pending PII Exchange card shows the booking row
6. Click "Send PII" → row disappears after `fetchExchanges()` refetch
7. Safety Valve tab badge count reflects both `criticalRequests` and `pendingExchanges`
