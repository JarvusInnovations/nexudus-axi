---
status: done
depends: [rooms-read]
specs:
  - specs/api/resources.md
  - specs/commands/rooms.md
issues: []
pr: 18
---

# Plan: Availability reads occupancy, not the `Available` flag

## Scope

Fix the core correctness bug where `rooms free` / `rooms day` / `rooms slots` reported **booked rooms as
free**. The availability grid's `Available` field means "bookable in principle" (inside shifts, permitted
for this member); occupancy lives in `Booked` / `BookedCount` / `Capacity`, and the tool was reading only
`Available`. **In:** a single `isSlotFree` predicate, `compressSlots` using it, and the spec correction in
both `api/resources.md` and `commands/rooms.md`. **Out:** cross-checking the bookings feed as a second
source (the grid is authoritative and strictly better — it also reflects resource-level blocks the feed
never shows).

## Implements

- `specs/api/resources.md` § Per-slot availability — the occupancy rule and what `Available` actually means.
- `specs/commands/rooms.md` § rooms free — the corrected free-room definition.

## Approach

`isSlotFree(slot)` = `Available !== false` **and** `BookedCount < Capacity`, defaulting a missing
`Capacity` to 1 and a missing `BookedCount` to `Capacity` when `Booked` is true. `compressSlots` switches
from `slot.Available` to the predicate, which propagates to every caller (`rooms free`/`day`/`slots` and
`book`'s pre-check all derive conflicts from it).

## Validation

- [x] Unit: `{Available: true, Capacity: 1, BookedCount: 1, Booked: true}` is busy; unbooked is free;
      multi-unit respects capacity; `Available: false` is never free; missing counts fall back sanely.
- [x] Unit: `compressSlots` splits ranges on occupancy while `Available` stays true throughout.
- [x] Live: the window that exposed the bug now reports the booked favorites as busy with their ranges.
- [x] Live: `--all` surfaces a genuinely free room for the same window.

## Risks / unknowns

- Multi-unit (`AllowMultipleBookings`, `Capacity > 1`) resources are covered by the capacity comparison but
  remain unexercised live — no such resource exists on the probe space.

## Notes

- **Found in production use, not by testing** — a `book` call was refused ("already booked") for a window
  `rooms free` had just listed as free. The booking engine was right; our reading was wrong.
- The original `rooms-read` plan spec'd "free when every overlapping slot is `Available`", so this was a
  spec defect propagated faithfully into code — the fix had to start in `specs/api/resources.md`.
- **The grid is strictly better than the bookings feed** for availability: a resource carrying
  `IsAvailable: false` (a space-level block) shows `Booked: true` in its slots with no corresponding row in
  `fullCalendarBookings`. Cross-checking the feed would have *under*-reported busy.
- Existing fixtures were unaffected (slots with only `Available: true` still evaluate free), so the
  regression surfaced only against live data — a reminder that fixtures mirroring our own misreading
  cannot catch a misread contract.

## Follow-ups

- **Deferred:** multi-unit (`Capacity > 1`) occupancy is implemented and unit-tested but unexercised live;
  confirm against a space that has such a resource.
