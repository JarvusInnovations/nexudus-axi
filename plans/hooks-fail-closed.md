---
status: done
depends: [setup-hooks-fail-closed]
specs:
  - specs/commands/setup.md
  - specs/commands/auth.md
  - specs/commands/bookings.md
  - specs/commands/book.md
issues: []
pr: 24
---

# Plan: Every hook, fee and confirmation read fails closed

## Scope

A pre-submission re-review of v0.3.1 looked for the rest of the class the catalog maintainer had
blocked on: a read that fails being treated as "nothing there". **In:**
- `setup hooks uninstall` skipped an unreadable or unparseable target and reported removal or a no-op,
  so a hook could stay installed.
- `status` and `doctor` showed such a target as "not installed".
- Codex counted as current with `[features] hooks = false`.
- Install's no-op check ignored `config.toml`.
- A failed install's hint assumed permissions and didn't name what did install.
- A failed fee lookup printed `0`.
- `book` went ahead when the before-snapshot failed, so an existing booking could pass for the new one.

## Implements

- `specs/commands/setup.md`: problems are reported in status; uninstall fails `IO_ERROR`; Codex's feature
  flag is checked; the no-op snapshot includes `config.toml`; install failure hints name what did install.
- `specs/commands/auth.md`: doctor fails on any hook problem.
- `specs/commands/bookings.md`: a fee that couldn't be read is `unknown (...)`, never `0`.
- `specs/commands/book.md`: `CONFIRMATION_UNAVAILABLE` before commit when the snapshot fails.

## Approach

One `readTarget` with three outcomes (absent, ok, error) replaces the null-on-failure `readJson`, and
every reader goes through it. `StatusRow.problem` carries the reason and renders as a `problems[]`
table. `codexFeatureProblem` reads the user's `config.toml` (where the SDK writes the flag at any
scope). Uninstall collects failures and throws after cleaning what it can. The tests run under a temp
HOME, because the SDK writes Codex's flag to the user's config even at project scope.

## Validation

- [x] Unit: uninstall with unparseable or unreadable settings → IO_ERROR naming the file and what was
      removed.
- [x] Unit: status shows `problems[]`; doctor fails on an unparseable target and on Codex
      `hooks = false`.
- [x] Unit: a repeat install that re-enables Codex's flag is not reported as a no-op.
- [x] Unit: a failed fee lookup gives `unknown (...)`; `book` with a failed before-snapshot raises
      CONFIRMATION_UNAVAILABLE and never calls CreateInvoice.
- [x] All 7 new tests fail against the previous source and pass with the fix; 128 tests in total.
