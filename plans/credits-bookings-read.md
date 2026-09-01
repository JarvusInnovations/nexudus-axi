---
status: in-progress
depends: [auth-spaces]
specs:
  - specs/commands/credits.md
  - specs/commands/bookings.md
  - specs/api/coworker.md
  - specs/api/bookings.md
issues: []
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

- [ ] `credits` renders personal + team balances against a live membership; zero-credit state is definitive.
- [ ] `bookings` shows a known upcoming booking with correct wall-clock times; empty window definitive; unpaid flag appears when applicable.
- [ ] `bookings view` shows detail + fee for an upcoming booking.
- [ ] Spec updates merged for every "unverified" read contract touched; fixtures scrubbed of tenant identifiers.

## Risks / unknowns

- fullCalendarBookings may return other members' bookings on shared resources (it feeds the portal calendar) — if so, filter to `CoworkerId` and spec the rule.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
