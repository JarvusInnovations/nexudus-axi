---
status: planned
depends: [auth-spaces]
specs:
  - specs/commands/rooms.md
  - specs/api/resources.md
issues: []
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

- [ ] `rooms` renders the spec schema against a live space; `--type` and `--available` filter correctly.
- [ ] `rooms view` resolves by id and by unambiguous name; ambiguous name → exit 2 listing candidates; description arrives as clean truncated text.
- [ ] `rooms slots` for a date with mixed bookings renders correct free/booked ranges (fixture with known slot pattern); fully-booked day is definitive.
- [ ] Date forms per time-and-timezone resolve in the space's zone (fixture with a machine-tz ≠ space-tz).

## Risks / unknowns

- Slot `Capacity`/`BookedCount` semantics for multi-unit resources (AllowMultipleBookings) — compression may need per-unit awareness; spec update if so.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
