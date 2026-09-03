---
status: done
depends: [slot-occupancy-fix, booking-time-confirmation]
specs:
  - specs/architecture.md
  - specs/api/bookings.md
  - specs/commands/rooms.md
  - specs/behaviors/time-and-timezone.md
issues: []
pr: 19
---

# Plan: Spec drift sweep after the timezone/occupancy fixes

## Scope

Bring the specs back into conformance after a day of fast-moving fixes. **In:** the stale booking-id
recovery method in `api/bookings.md` (it still described the window-matching approach that
`booking-time-confirmation` replaced — a spec contradicting its own sibling), an occupancy cross-reference
on `rooms slots`, the offset-trap consequence in the time behavior spec, and the `architecture.md` module
map (four modules missing entirely, several command descriptions stale, prefs.json and the password env
var undocumented). **Out:** code changes — this is a documentation-conformance pass only.

## Implements

- `specs/api/bookings.md` — id recovery by set-difference, not window match.
- `specs/commands/rooms.md` — `slots` free/booked decided by the occupancy rule.
- `specs/behaviors/time-and-timezone.md` — the silent-shift consequence + link to the API finding.
- `specs/architecture.md` — module map, command surfaces, config/state, env vars.

## Approach

Targeted audit of the contracts today's PRs touched (grep for the superseded phrasings), then correct each
in place. No code moves; `check`, `docs:check` and the suite must stay green to prove it.

## Validation

- [x] No spec still describes id recovery by matching the requested window.
- [x] `rooms slots` and `rooms free` both point at the single occupancy rule.
- [x] The time behavior spec states the offset consequence and links the API finding.
- [x] `architecture.md`'s module map matches `ls src/**` exactly, including booking/mybookings/profile/stub.
- [x] `bun run check`, `docs:check`, and the full suite pass unchanged.

## Risks / unknowns

- Plans are frozen historical records and are deliberately **not** rewritten, so older plan notes still
  describe the superseded behavior. That is correct per the protocol but can mislead a reader who greps
  plans rather than specs.

## Notes

- The sharpest finding was `api/bookings.md` still prescribing **window-matching** for id recovery: not
  merely stale, but the precise failure mode `booking-time-confirmation` existed to remove, left sitting in
  the API spec where an implementer would most plausibly look first.
- Root cause is process, not carelessness: three fixes landed in one session, each updating the spec it
  *owned* while leaving sibling specs describing the old behavior. Worth a `grep` for superseded phrasings
  whenever a plan changes a mechanism other specs reference.
- The architecture module map had drifted furthest (four modules absent) because no single plan owns it —
  every plan adds to it and none is responsible for it.

## Follow-ups

- **Consider:** a `/audit-spec-drift` pass is now cheap to run and would catch this class automatically;
  worth doing after any multi-plan day rather than relying on a targeted grep.
