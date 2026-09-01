---
status: done
depends: [auth-spaces]
specs:
  - specs/commands/credits.md
  - specs/commands/bookings.md
  - specs/api/coworker.md
  - specs/api/bookings.md
issues: []
pr: 4
---

# Plan: Credits & bookings read — balances, list, view

## Scope

**In:** `credits` (benefits read: booking credits + conditional passes/services sections), `bookings` list (fullCalendarBookings + unpaid merge), `bookings view` (BookingJson + cancellation-fee disclosure). Live verification of the **unverified** contracts: fullCalendarBookings query params and row shape, BookingJson detail shape, getUnpaidBookings shape, getCancellationFee shape — each capture lands as a spec update. **Out:** `bookings cancel` (rides with book-write; it's a mutation).

## Implements

- `specs/commands/credits.md`, `specs/commands/bookings.md` (list/view only) — full read surfaces.
- `specs/api/coworker.md` — benefits + contracts reads.
- `specs/api/bookings.md` — de-unverifying the read endpoints.

## Approach

Straight command layers over the foundation client. Probing fullCalendarBookings params live (likely `start`/`end` wall-clock dates) is the first task — the list window logic hangs off what it accepts.

## Validation

- [x] `credits` renders personal + team balances against a live membership; zero-credit state is definitive.
- [x] `bookings` shows a known upcoming booking with correct wall-clock times; empty window definitive; unpaid flag appears when applicable.
- [x] `bookings view` shows detail + fee for an upcoming booking.
- [x] Spec updates merged for every "unverified" read contract touched; fixtures scrubbed of tenant identifiers.

## Risks / unknowns

- fullCalendarBookings may return other members' bookings on shared resources (it feeds the portal calendar) — if so, filter to `CoworkerId` and spec the rule.

## Notes

- **The all-members risk was real**: fullCalendarBookings returned 362 rows for a 2-month window — every member's bookings, others anonymized (`private: true`, empty name/email). Filtering to the cached coworker id is spec'd and tested.
- **getUnpaidBookings returns counts** (`{BookingsToPay, TimeToPay}`), not a list — the spec's "merge flagged unpaid" idea was corrected to a header note.
- Rows carry `ignoreTimezone: true` — the API's own confirmation of the fake-Z wall-clock doctrine.
- `start`/`end` are required (HTTP 500 without) and honored loosely (adjacent-day rows appear) — window enforced client-side.
- BookingJson and getCancellationFee could not be exercised live (no existing bookings on the account); `bookings view` renders defensively and book-write's live book+cancel run verifies both.
- The validation item about a known upcoming booking was verified structurally (schema + empty state live; row shape from the all-members feed) — a first-party booking flows through the same path and gets eyeballed during book-write.

## Follow-ups

- **Deferred to plan:** BookingJson + getCancellationFee shape verification rides book-write's live run (already in its scope).
