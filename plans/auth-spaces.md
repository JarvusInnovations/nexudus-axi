---
status: in-progress
depends: [foundation]
specs:
  - specs/commands/auth.md
  - specs/commands/setup.md
  - specs/api/coworker.md
  - specs/api/conventions.md
issues: []
---

# Plan: Auth & spaces — login, status, use, logout, doctor, hooks

## Scope

**In:** `auth login` (password grant → token store → profile bootstrap → hook install), `auth status` (+`--refresh`), `auth use`, `auth logout`, `doctor` (five checks per spec), `setup hooks [status|uninstall]`. Live verification of the spec's **unverified** contracts: `/api/token` response body, `/en/profile?_resource=User|Coworker` field paths, whether the profile carries the space IANA timezone — each capture lands as a spec update in this plan's PR. **Out:** any resource/booking command.

## Implements

- `specs/commands/auth.md`, `specs/commands/setup.md` — full surfaces.
- `specs/api/coworker.md` — profile bootstrap (benefits/contracts reads land with their commands).
- `specs/api/conventions.md` — de-unverifying the token flow.

## Approach

Command layers over foundation's token.ts/config.ts. Live-probe against a real space membership during development to capture true response shapes; scrub any captured instance identifiers before committing fixtures (public repo).

## Validation

- [ ] `auth login` against a live space stores tokens (0600), caches coworker id/business id/timezone, installs the hook, never writes the password anywhere.
- [ ] `auth status` lists spaces with the default marked; `--refresh` survives an expired access token via the refresh grant.
- [ ] `auth use`/`logout` idempotent per spec; logout with 2+ spaces and no flag → exit 2 listing them.
- [ ] `doctor` all-green on a healthy space; each failure mode produces its named remediation (fixture-driven).
- [ ] Spec updates merged for every "unverified" marker this plan touched.
- [ ] Committed fixtures contain no real tenant identifiers (ids, slugs, names, emails).

## Risks / unknowns

- 2FA (TOTP) path can only be fixture-tested unless a 2FA account is available.
- Refresh-token lifetime/rotation semantics unknown — if Nexudus rotates refresh tokens per use, the store must persist the new one atomically.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
