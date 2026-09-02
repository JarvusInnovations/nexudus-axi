---
status: in-progress
depends: [book-write]
specs:
  - specs/commands/book.md
  - specs/api/bookings.md
issues: []
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

- [ ] Live: a normal booking reports `confirmed: true` with the server's window and exits 0.
- [ ] Fixture: a server row differing from the request → leading `warning:` naming both windows, id present, exit 1.
- [ ] Fixture: no new row after commit → `confirmed: false`, exit 1, no fabricated window.
- [ ] Fixture: a shift onto the *next day* is still identified (id-diff, not window match).
- [ ] Live re-probe confirms the offset trap and that our own payload never carries an offset.

## Risks / unknowns

- A concurrent booking by the same member on the same resource inside the probe window could make the
  id-diff ambiguous; pick the row whose window is nearest the request and note it, rather than guessing silently.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
