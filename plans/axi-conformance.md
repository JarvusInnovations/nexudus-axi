---
status: in-progress
depends: [spec-drift-sweep]
specs:
  - specs/architecture.md
  - specs/commands/auth.md
  - specs/commands/book.md
  - specs/commands/home.md
  - specs/commands/setup.md
issues: []
---

# Plan: Close the AXI conformance gaps found in catalog admission review

## Scope

An independent pinned-source review of v0.2.2 (done ahead of the AXI catalog submission) found places where
the tool's behavior falls short of the AXI principles it claims. Fix them so the catalog entry can be pinned
to a release whose only exception is the one that doesn't fit a booking tool (no session-end capture).
**In:** extra positionals, the home view's false empties, hook registration from `auth login`, repeat
`setup hooks` / repeat `book` no-ops, `doctor`'s hook check, the `--version` fast path, and help/hint text
that was wrong or pointed into the repo. **Out:** session-end lifecycle hooks (nothing worth capturing for
room booking), and a confirmation gate on `bookings cancel` (fees are already shown by `bookings view`, and
AXI requires no gate).

## Implements

- `specs/architecture.md` § flags.ts: declared positional counts; extras fail as USAGE. § bin: fast path.
- `specs/commands/home.md`: a failed read renders `unavailable (...)`, never an empty result.
- `specs/commands/auth.md`: login reports hook state read-only; doctor treats a missing hook as `skipped`.
- `specs/commands/setup.md`: `setup hooks` is the only hook writer; repeat install says no-op; a declined
  install fails `SETUP_FAILED`.
- `specs/commands/book.md`: `--date` defaults to today; a repeat of a booking that already landed is a no-op.

## Approach

- `FlagSpec.positionals` (count or `"many"`, default 0) + `usage`; `parseFlags` rejects extras after parsing
  unless `--help` is present. Declared on `auth use`, `rooms view/slots/favorites`, `bookings view/cancel`.
- Home wraps both reads in a settle helper and renders failures with their error code, adding a `doctor`
  hint; still exit 0.
- `auth login` calls a read-only `hookSummary()`; `installHooks` is private to `setup hooks`, snapshots the
  target files to detect a no-op, and re-reads status to catch an SDK decline.
- `book`'s conflict branch fetches the caller's bookings for the date and returns the exact-match booking
  as a no-op before raising `UNAVAILABLE`.
- `bin/` answers bare `--version` through `axi-sdk-js/fast-path` (SDK bumped to 0.1.14) before importing the
  command graph.

## Validation

- [ ] Unit: extra positionals → USAGE naming the usage; variadic `rooms favorites` and `--help` unaffected;
      `auth logout <slug>` rejected instead of logging out of the default.
- [ ] Unit: home with a 500 on bookings or credits renders `unavailable (...)` and the `doctor` hint, exit 0.
- [ ] Unit: `auth login` writes no hook files under a temp HOME and reports `not installed`.
- [ ] Unit: repeat project-scope `setup hooks` reports no-op with files unchanged; a declined entrypoint
      fails `SETUP_FAILED`; doctor's missing-hook check is `skipped`.
- [ ] Unit: repeat `book` of my exact window → existing id, `(no-op)`, no CreateInvoice; someone else's
      booking or my overlapping different window → `UNAVAILABLE`.
- [ ] Built CLI under a temp HOME: `--version`, `doctor extra`, `auth logout acme`, `rooms view a b`,
      `setup hooks` twice, `doctor` hooks row, `setup hooks uninstall`.
- [ ] Live: re-run a `book` that just succeeded on a real space → reports the existing booking, exit 0.

## Risks / unknowns

- The repeat-book no-op matches on the calendar feed's `start`/`end` wall-clock strings; if the feed ever
  rounds or shifts stored times, an identical re-run would fall back to `UNAVAILABLE` (safe, just not a no-op).
