# Form Step Consolidation Plan

## Context
The form card now matches the chat panel at 640px. With that vertical space, showing 2 fields then waiting for 3 more steps is wasteful UX. We collapse each form from 5/5/3 steps down to 2 steps each by merging related field groups into single visible blocks.

## Strategy
Keep progressive disclosure (Step 2 reveals only after Step 1 key fields are filled), but merge old steps 2–3 into new Step 1, and old steps 4–5 into new Step 2. The submit handler, validation logic, and field state are untouched — only visibility conditions and `totalSteps` change.

---

## School Run: 5 → 2 steps

### New Step 1 (always visible) — "Where & Who"
Merge old Steps 1 + 2:
- Pickup Address + School Name (old step 1)
- Grade Level + Age + Student Count + Car Seat (old step 2)

### New Step 2 (reveals when: `pickupZip && schoolName && gradeLevel && studentCount`) — "When & Contact"
Merge old Steps 3 + 4 + 5:
- Frequency + Start Date + conditional Days/End Date (old step 3)
- AM/PM + Bell Time + Dismissal Time (old step 4)
- Parent Name + Phone + Special Needs/No-Release/ASAP checkboxes + Note (old step 5)

### New `schoolVisibleSteps` logic (replaces lines 287–297):
```js
const schoolVisibleSteps = useMemo(() => {
  const step2 = pickupZip.trim().length > 0 && schoolName.trim().length > 0
    && gradeLevel.length > 0 && studentCount.length > 0;
  return step2 ? 2 : 1;
}, [pickupZip, schoolName, gradeLevel, studentCount]);
```

---

## Care Ride: 5 → 2 steps

### New Step 1 (always visible) — "Where & Mobility"
Merge old Steps 1 + 2:
- Pickup Location + Dropoff Location (old step 1)
- Access Type + Service Level + Facility (old step 2)

### New Step 2 (reveals when: `pickupLocation && dropoffLocation && mobilityLevel && serviceLevel`) — "Trip Details & Schedule"
Merge old Steps 3 + 4 + 5:
- Trip Type + Return Status + Return Time + Stairs + Duration Type + Additional Passengers (old step 3)
- Oxygen / Bariatric / Service Animal / ASAP checkboxes (old step 4)
- Appointment Time + Date(s) + Requester Name + Phone + Note (old step 5)

### New `medicalVisibleSteps` logic (replaces lines 299–310):
```js
const medicalVisibleSteps = useMemo(() => {
  const step2 = pickupLocation.trim().length > 0 && dropoffLocation.trim().length > 0
    && mobilityLevel.length > 0 && serviceLevel.length > 0;
  return step2 ? 2 : 1;
}, [pickupLocation, dropoffLocation, mobilityLevel, serviceLevel]);
```

---

## Event Shuttle: 3 → 2 steps

### New Step 1 (always visible) — unchanged (old step 1)
Event Category + Guests + Vehicle + Pickup + Venue + Shuttle Mode

### New Step 2 (same condition as before) — "Schedule & Coordinator"
Merge old Steps 2 + 3:
- Itinerary Type + Return Time + Event Date + Departs + Ceremony (old step 2)
- Planner Name + Contact + Duration + Amenity checkboxes + Note (old step 3)

### New `weddingVisibleSteps` logic (replaces lines 312–319):
```js
const weddingVisibleSteps = useMemo(() => {
  const step2 = eventCategory.length > 0 && guestCount.length > 0 && vehicleStyle.length > 0
    && hotelZip.trim().length > 0 && venueZip.trim().length > 0 && shuttleMode.length > 0;
  return step2 ? 2 : 1;
}, [eventCategory, guestCount, vehicleStyle, hotelZip, venueZip, shuttleMode]);
```

---

## totalSteps Update (line ~328)
```diff
- const totalSteps = activeTab === 'school' ? 5 : activeTab === 'medical' ? 5 : 3;
+ const totalSteps = 2;
```

## effectiveXxxSteps Update (lines ~322–324)
```diff
- const effectiveSchoolSteps = isImmediate ? 5 : schoolVisibleSteps;
- const effectiveMedicalSteps = isImmediate ? 5 : medicalVisibleSteps;
- const effectiveWeddingSteps = isImmediate ? 3 : weddingVisibleSteps;
+ const effectiveSchoolSteps = isImmediate ? 2 : schoolVisibleSteps;
+ const effectiveMedicalSteps = isImmediate ? 2 : medicalVisibleSteps;
+ const effectiveWeddingSteps = isImmediate ? 2 : weddingVisibleSteps;
```

## JSX Changes in forms.tsx

For each form, replace the 4 separate `AnimatePresence` blocks (steps 2–5 or 2–3) with a **single** `AnimatePresence` block keyed `"step2"` containing all merged fields. The condition changes from `effectiveXxxSteps >= 2`, `>= 3`, `>= 4`, `>= 5` to just `effectiveXxxSteps >= 2`.

Within that single Step 2 block, all the internal conditional fields (end date, return time, appointment date, etc.) stay exactly as-is — they're conditioned on field values, not step numbers, so no changes needed.

---

## File to Modify
- `src/components/forms.tsx` — step visibility logic (~lines 287–328) + JSX step blocks for all 3 forms

## Verification
1. School Run: Fill pickup + school + grade + count → Step 2 content appears (schedule/times/guardian all visible at once)
2. Care Ride: Fill locations + mobility + service → Step 2 content appears (trip/dates/contact all visible)
3. Event Shuttle: Fill all step 1 fields → Step 2 content appears (schedule + coordinator together)
4. Progress bar reads "Step 1 of 2" / "Step 2 of 2" correctly
5. Submit button still works and sends correct payload
