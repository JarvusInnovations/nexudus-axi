---
status: done
depends: [book-write]
specs:
  - specs/commands/book.md
  - specs/api/bookings.md
issues: []
pr: 16
---

# Plan: Confirmed booking times — read back, never echo

## Scope

Close the gap where `book` reports the window it *asked for* rather than the one the server *stored*, so a
silent time shift is invisible to an agent. **In:** pre/post snapshot id-diff to identify the created row
(robust to a shift onto an adjacent day), confirmed window rendered from the server row, `confirmed: true`,
a leading `warning:` + exit 1 on a shift, `confirmed: false` + exit 1 when the row can't be identified, and
the API spec's datetime-format findings from the live probe. **Out:** auto-cancelling a shifted booking
(destructive and surprising — the id is reported so the caller decides), retry-on-shift.

## Implements

- `specs/commands/book.md` § Confirmed times — readback, warning, exit codes.
- `specs/api/bookings.md` § datetime format — the offset-shift trap and the two negative results.

## Approach

Replace the requested-window id lookup with: snapshot my bookings for `date ± 1` before the commit
(ids only), commit, refetch, take the set difference filtered to the resource. Render the found row's
`start`/`end` as the confirmed window; compare against the requested wall-clock to decide happy /
shifted. Both divergent paths set `process.exitCode = 1` (the `doctor` precedent) while still emitting the
full structured payload including the id.

## Validation

- [x] Live: a normal booking reports `confirmed: true` with the server's window and exits 0.
- [x] Fixture: a server row differing from the request → leading `warning:` naming both windows, id present, exit 1.
- [x] Fixture: no new row after commit → `confirmed: false`, exit 1, no fabricated window.
- [x] Fixture: a shift onto the *next day* is still identified (id-diff, not window match).
- [x] Live re-probe confirms the offset trap and that our own payload never carries an offset.

## Risks / unknowns

- A concurrent booking by the same member on the same resource inside the probe window could make the
  id-diff ambiguous; pick the row whose window is nearest the request and note it, rather than guessing silently.

## Notes

- **The probe reproduced a real shift, but it is a client footgun, not a server defect**: only an
  offset-bearing `FromTime` (`15:00:00-04:00` → stored `19:00`) moves the booking. The fake-Z and bare
  forms both round-trip verbatim, `X-Use-Timezone` does nothing, and midnight + the DST fall-back
  ambiguous hour are stable. Third-party reports of "Nexudus mangling timezones" are most plausibly
  clients emitting `Date.toISOString()` — worth verifying before accepting that framing.
- The tool was never exposed (`toApiWallclock` hand-builds the string), so this plan is defense-in-depth
  rather than a bug fix — the readback also catches divergences nobody has characterized yet.
- Set-difference on id (not window matching) is the load-bearing choice: the previous implementation
  looked the booking up *by the requested start*, so a shifted booking would have surfaced as a missing
  id rather than a warning — the failure would have been quiet in exactly the case that matters.

## Follow-ups

- **Deferred:** `bookings view`/`cancel` still render times from whatever row they fetched, which is
  already server-sourced — no echo risk — so no change was needed there.
