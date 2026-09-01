---
status: done
depends: [rooms-read]
specs:
  - specs/commands/rooms.md
  - specs/behaviors/spaces-and-accounts.md
  - specs/principles.md
issues: []
pr: 5
---

# Plan: Room finding — free-at, day view, favorites lens, output-domain cleanup

## Scope

The owner's day-to-day finding workflow, spec'd from live use: **In:** `rooms free` ("which rooms are available for my 4pm meeting" — window check across the candidate set with a `+1h` default), `rooms day` (all-room free-ranges view clipped to a `--hours` window), `rooms favorites [add|remove|clear]` backed by a new per-space `prefs.json` (credentials/preferences lifecycle split: logout keeps prefs), the favorites lens as the default candidate set for free/day with a loud `--all` escape, `fav`-aware `rooms` list ordering, and the output-domain cleanup (no plan/spec references in user-facing text — new project principle). **Out:** favorites influencing `book` (booking stays explicit), cross-space views.

## Implements

- `specs/commands/rooms.md` — §§ rooms free / rooms day / rooms favorites + the "lens, not a wall" local principle.
- `specs/behaviors/spaces-and-accounts.md` — § Preferences (prefs.json, logout survival).
- `specs/principles.md` — "Output speaks the user's domain, never the repo's" applied to stubs and home.

## Approach

`prefs.json` read/write helpers in config.ts (logout narrowed to token.json). `rooms free`/`day` reuse fetchResources + fetchAvailability; per-room availability fetched concurrently (≤ handful of rooms). Free-check: every slot overlapping the half-open window `Available`. Day view: compressSlots → clip ranges to the hours window → join. Stub/home text rewritten per the principle.

## Validation

- [x] `rooms free --from 4pm` against the live space answers with favorites-lensed free/busy tables and echoes the window + lens.
- [x] `rooms day` renders one row per room with clipped free ranges; `all day` / `booked out` sentinels correct (fixture-driven for the mixed case).
- [x] `rooms favorites add/remove/clear` round-trips prefs.json; re-add is a no-op; `auth logout` leaves prefs.json in place (test).
- [x] With favorites set, `free`/`day` default to them and `--all` widens; with none set, all rooms considered — both states name the lens.
- [x] No user-facing output references plans/ or repo internals (grep over src/ for `plans/` in string literals).

## Risks / unknowns

- Concurrent availability fetches (one per candidate room) against an undocumented API — keep the candidate set small by default (the lens) and serialize politely if the API balks.

## Notes

- Live bonus: the day view naturally surfaces shift-limited rooms — a room bookable 09:00–18:00 renders exactly that range while 24/7 rooms show `all day`, with no shift-specific code.
- Stale-favorites fallback: if every favorite stops resolving, free/day fall back to the all lens rather than searching nothing.
- Concurrent per-room availability fetches (Promise.all over ≤7 rooms) drew no API pushback.
- The `rooms` catalog keeps every room visible with favorites sorted first + a `fav` column only when favorites exist (schema stays minimal otherwise).

## Follow-ups

None.
