---
status: planned
depends: []
specs:
  - specs/architecture.md
  - specs/api/conventions.md
  - specs/behaviors/spaces-and-accounts.md
  - specs/behaviors/time-and-timezone.md
issues: []
---

# Plan: Foundation — scaffold, client, config, flags, wall-clock time

## Scope

The substrate every command sits on. **In:** package scaffold (`package.json` via package-manager commands, tsconfig, `bin/`, `.tool-versions` via asdf, `ci.yml`), `src/cli.ts` (`runAxiCli` wiring + `formatError` with the USAGE-set→2 mapping), `src/flags.ts` (declared per-command flag sets with the `--space` always-allowed global), `src/reference.ts` skeleton, `src/version.ts`, `src/config.ts` (multi-space store: `config.json` + `spaces/{slug}/token.json`, env overrides, `resolveActiveSpace` with the mutation guard), `src/nexudus/client.ts` (headers per api/conventions, 401→refresh-once→retry hook, error translation incl. the HTML-body guard), `src/nexudus/token.ts` (password/refresh grants), `src/output/` (ported FieldDef/render helpers), `src/time/wallclock.ts` (human forms → space wall-clock strings; space-tz today/tomorrow via Intl). **Out:** all command logic — commands register as stubs throwing `NOT_IMPLEMENTED` naming their plan.

## Implements

- `specs/architecture.md` — structure, build, config, error mapping, CI shape.
- `specs/api/conventions.md` — client, headers, token grants, error translation.
- `specs/behaviors/spaces-and-accounts.md` — the store + resolution order + mutation guard.
- `specs/behaviors/time-and-timezone.md` — parsing and rendering (fake-Z aware) as pure functions.

## Approach

Copy-adapt calendly-axi (cli/flags/reference/output/version verbatim shape) + slack-axi (per-tenant token store, `resolveActiveToken` → `resolveActiveSpace`). Wall-clock module is new: treat API datetimes as strings, never `Date`-parse a fake-Z value into an instant; `Intl.DateTimeFormat` with the cached IANA zone computes the space's "today".

## Validation

- [ ] `bun run build` compiles; `dist/bin/nexudus-axi.js` runs; `--version` prints package version.
- [ ] `bun run check` + `bun run test` pass.
- [ ] Unknown flag → exit 2 with valid set inlined, no network call; `--space` accepted on every command.
- [ ] Config: two fake spaces stored → default resolution, `--space` override, mutation-guard error listing both; env override wins over all.
- [ ] Token module: password grant and refresh grant fire correct form bodies (fetch-spy); 401→refresh→retry happens exactly once.
- [ ] wallclock unit tests: `--date today/tomorrow/+2d/2026-09-05` (space-tz, DST-safe component arithmetic), `--from 2pm --to +2h`, inverted window → `VALIDATION_ERROR` echoing both resolved boundaries, cross-midnight rejection, fake-Z round-trip (14:00 in, `T14:00:00.000Z` out, `14:00` rendered).
- [ ] Smoke test: no-config invocation of a stub command → structured error, exit 1, no stack trace.

## Risks / unknowns

- `/api/token` response field names unverified (spec flags this) — token.ts written against both `access_token` and `AccessToken` conventions until `auth-spaces` captures the real body and the spec is updated.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
