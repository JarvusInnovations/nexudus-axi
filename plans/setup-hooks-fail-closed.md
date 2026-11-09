---
status: done
depends: [axi-conformance]
specs:
  - specs/commands/setup.md
issues: []
---

# Plan: `setup hooks` fails closed when the SDK reports a write error

## Scope

The AXI catalog maintainer's pinned review of v0.3.0 found that `installHooks` turned the SDK's
`onError` into a `completed with a warning: ...` result on exit 0. It also returned before the
status re-read that raises `SETUP_FAILED`. So a partial or total write failure (EACCES on one agent's
settings file, an unmanaged OpenCode plugin) looked like success. **In:** that path only.
**Out:** everything else in setup, which the review passed.

## Implements

- `specs/commands/setup.md` § setup hooks: a write the SDK reports as failed is `SETUP_FAILED`
  (exit 1), carrying every reported message and the apps left without a current hook.

## Approach

Collect every `onError` message, re-read status regardless, and throw `SETUP_FAILED` when any error
was reported. The hints name the agents that are not installed or not current, plus the rerun command
with its scope. The existing entrypoint-declined path stays as it was for the no-error case.

## Validation

- [x] Unit: with a read-only project `.claude/`, `setup hooks --scope project` throws `SETUP_FAILED`
      naming `.claude` and Claude Code. The test fails against the previous `setup.ts` and passes with
      the fix.
- [x] Existing setup tests (no-op repeat, declined entrypoint, doctor) still pass; 121 total.

## Notes

- Our own pre-submission review of v0.2.2 had listed "warnings exit 0" among the smaller defects,
  but it was missed in `axi-conformance`. The catalog review caught it at v0.3.0.
