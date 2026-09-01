---
status: in-progress
depends: [rooms-read, credits-bookings-read]
specs:
  - specs/commands/home.md
  - specs/architecture.md
issues: []
---

# Plan: Home view & docs generation

## Scope

**In:** the no-args home view (upcoming bookings + credits + multi-space line, ≤ ~25 lines, unconfigured state), `src/reference.ts` filled out as the single source (top-level help, per-command `--help`), SKILL.md generation (`bun run docs` / `docs:check`), README. **Out:** hook install mechanics (landed with auth-spaces).

## Implements

- `specs/commands/home.md` — full surface.
- `specs/architecture.md` — docs & skill generation section.

## Approach

Port calendly-axi's `generate-skill.ts` + reference-driven help rendering. Home composes the same reads as `bookings` and `credits` with tight row caps — no new API surface.

## Validation

- [ ] Bare `nexudus-axi` on a configured space renders bookings + credits within budget; unconfigured state gives the exact login command.
- [ ] `--help` (top-level and every command) renders from reference.ts; `docs:check` green in CI and fails on a stale SKILL.md (verified by mutating it).
- [ ] SKILL.md contains no live state and uses `npx -y nexudus-axi ...` forms.

## Risks / unknowns

- Home latency: two API reads at session start — acceptable for v1; note actual timing at closeout.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
