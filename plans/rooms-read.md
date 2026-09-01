---
status: done
depends: [auth-spaces]
specs:
  - specs/commands/rooms.md
  - specs/api/resources.md
issues: []
pr: 3
---

# Plan: Rooms read — list, view, slots

## Scope

**In:** `rooms` list (+`--type`/`--available` filters), `rooms view` (id-or-name resolution, HTML description stripping, rules rendering), `rooms slots` (availability via resource GUID, slot→contiguous-range compression), `src/nexudus/resolve.ts`, `src/nexudus/slots.ts`. **Out:** anything that writes.

## Implements

- `specs/commands/rooms.md` — full surface.
- `specs/api/resources.md` — publicresources + GetAvailabilityAtWithUser consumption; de-unverifying the anonymous-variant note and product/custom-field shapes where encountered.

## Approach

One `_depth=3` publicresources fetch backs all three subcommands (resolution needs the same payload slots needs for the GUID). Range compression is a pure function over `AvailableSlots[]` — unit-test it hard; it's the output agents act on.

## Validation

- [x] `rooms` renders the spec schema against a live space; `--type` and `--available` filter correctly.
- [x] `rooms view` resolves by id and by unambiguous name; ambiguous name → exit 2 listing candidates; description arrives as clean truncated text.
- [x] `rooms slots` for a date with mixed bookings renders correct free/booked ranges (fixture with known slot pattern); fully-booked day is definitive.
- [x] Date forms per time-and-timezone resolve in the space's zone (fixture with a machine-tz ≠ space-tz).

## Risks / unknowns

- Slot `Capacity`/`BookedCount` semantics for multi-unit resources (AllowMultipleBookings) — compression may need per-unit awareness; spec update if so.

## Notes

- **Structured pricing can be entirely absent** — the live space leaves `Price: 0` / `PriceFormatted: null` and describes cost only in description HTML. The `rate` column renders what the API gives and the spec now says the authoritative cost is `book --dry-run`'s preview.
- Booking-rule fields were mostly `null` live (`LateCancellationLimit: -30` was the only one set) — `view` renders rules compactly, only when present.
- The mixed free/booked compression pattern couldn't be exercised live (the room was fully free), so it's pinned by unit fixtures including gap, midnight, and month-boundary cases; a real mixed day gets checked incidentally during book-write's live run.
- Slot semantics for multi-unit resources (AllowMultipleBookings) remain unexplored — none live here set it with capacity variance; the risk note stands for a future space.

## Follow-ups

None.
