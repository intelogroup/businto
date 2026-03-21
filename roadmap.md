# Businto — Roadmap

Focus: complete both sides of the marketplace — customer AND operator journeys. No fleet infra, no real-time GPS.

---

## P0 — Journey Blockers (ship these first)

- [x] **Operator dashboard** — operators need a home: pending job requests, active trips, quote history, earnings summary
- [ ] **Operator quote submission UI** — form to submit price + ETA on a received request; currently operators get email only
- [x] **Trip timeline / booking confirmation** — customer needs a clear "your trip is booked" state with operator name, ETA, and contact
- [x] **Booking status page** — `/trips/[id]` with step-by-step status: requested → quoted → accepted → en route → completed
- [ ] **Operator profile completion flow** — onboarding checklist: add specialties, service radius, vehicle info, documents

---

## P1 — User Journey Completeness

- [ ] **Rating & review UI** — post-trip, customer rates operator (1–5 stars + comment); API exists, UI is missing
- [ ] **Customer trip history** — filterable list of past trips with status, operator, cost
- [ ] **Operator earnings history** — accepted trips, payout per trip, total this month
- [ ] **In-app messaging** — customer ↔ operator chat on a trip (chat route exists; needs UI thread view)
- [ ] **Customer profile page** — edit name, contact info, saved medical transport preferences
- [ ] **Quote expiry countdown** — show timer on open quotes so customer knows urgency; prevent stale-quote acceptance
- [ ] **Operator availability toggle** — operators can pause/resume receiving new requests

---

## P2 — Quality of Life

- [ ] **Push/SMS notification opt-in** — Brevo SMS for critical events (quote received, trip accepted, 30-min ETA)
- [ ] **Re-request flow** — one-click re-submit a past trip request with same details
- [ ] **Operator search / directory** — customer can browse verified operators by specialty and location before submitting
- [ ] **Admin: dispute management** — flag a trip for review; simple status + note, no workflow engine needed

---

## Out of Scope (do not build)

- Real-time GPS tracking of drivers
- Fleet management / driver scheduling
- Direct payment processing (brokerage model — do not change)
- Non-medical transport types
- Mobile native app
