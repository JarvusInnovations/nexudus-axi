---
status: done
depends: [hooks-fail-closed]
specs:
  - specs/architecture.md
  - specs/behaviors/spaces-and-accounts.md
  - specs/commands/bookings.md
issues: []
pr: 26
---

# Plan: Every read fails closed

## Scope

A pre-submission re-review of v0.3.2 hunted outside the hooks path and found more reads whose failure
became an empty result. **In:**
- `fetchMyBookings` filtered every row away when no member id was cached, which is always the case in
  `NEXUDUS_AXI_TOKEN` mode. It also turned a non-list response into `[]`. As a result, `bookings`
  and home said "nothing booked" and `bookings cancel` claimed a no-op on exit 0.
- `readPrefs` and `readConfig` read a corrupt file as empty, and `favorites clear` then overwrote it.
- A failed unpaid-count read vanished.
- `AvailableSlots` and `Resources` responses without their list became "fully booked" or "no rooms".
- `auth login`'s hook summary ignored problems.

## Implements

- `specs/architecture.md` § Config & state: reads fail closed.
- `specs/behaviors/spaces-and-accounts.md`: CONFIG_INVALID for unparseable local files; the coworker id
  comes from the cache, else a live profile read.
- `specs/commands/bookings.md`: UNEXPECTED_RESPONSE for a calendar that isn't a list;
  `unpaid: unknown (...)` when that read fails.

## Approach

`resolveCoworkerId` returns the cached id, else the live `/en/profile` id, and both `fetchMyBookings`
and `book` use it. That makes env-token mode work rather than just fail honestly. List-shaped responses
are checked with `Array.isArray` and throw UNEXPECTED_RESPONSE. `readJsonFile` throws CONFIG_INVALID
naming the file. `hookSummary` reports problems first. The SETUP_FAILED message no longer repeats one
error in two wordings.

## Validation

- [x] Unit: with no cached id, a cancel finds the booking via a live profile read (no `(no-op)`).
- [x] Unit: a non-list calendar, a missing `AvailableSlots` or a missing `Resources` → UNEXPECTED_RESPONSE.
- [x] Unit: a corrupt prefs file → CONFIG_INVALID, and `favorites clear` leaves the file untouched.
- [x] Unit: a failed unpaid read → `unpaid: unknown (...)`.
- [x] All 5 new tests fail against the previous source and pass with the fix; 133 tests in total.
