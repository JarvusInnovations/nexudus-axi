---
status: done
depends: [responses-fail-closed]
specs:
  - specs/commands/bookings.md
  - specs/commands/credits.md
issues: []
---

# Plan: Partial 200 bodies never become a state claim

## Scope

The v0.3.4 pre-submission review confirmed every money and mutation fix, and left two state claims made
on a partial 200 body. **In:**
- A `BookingJson` lookup without `Value.Id` read as "not found", so `bookings cancel` claimed a no-op
  with exit 0.
- A benefits group without its `BookingCredits` list read as "no booking credits" (home dropped the line).

## Implements

- `specs/commands/bookings.md`: only a 404 is not-found; a 200 without an id is UNEXPECTED_RESPONSE.
- `specs/commands/credits.md`: a group without its list is UNEXPECTED_RESPONSE.

## Validation

- [x] Unit: `{Value: null}` from BookingJson → UNEXPECTED_RESPONSE; `{Personal: {}}` → UNEXPECTED_RESPONSE.
- [x] Both new tests fail against the previous source and pass with the fix; 142 tests in total.

## Notes

- The live portal's not-found shape for BookingJson hasn't been observed. If it is a 200 with
  `Value: null` rather than a 404, a repeat cancel of a booking outside the window fails closed
  (UNEXPECTED_RESPONSE) instead of reporting a no-op. That loses idempotency, but it claims nothing false.
