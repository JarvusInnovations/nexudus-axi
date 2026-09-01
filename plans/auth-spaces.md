---
status: done
depends: [foundation]
specs:
  - specs/commands/auth.md
  - specs/commands/setup.md
  - specs/api/coworker.md
  - specs/api/conventions.md
issues: []
pr: 2
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

- [x] `auth login` against a live space stores tokens (0600), caches coworker id/business id/timezone, installs the hook, never writes the password anywhere.
- [x] `auth status` lists spaces with the default marked; `--refresh` survives an expired access token via the refresh grant.
- [x] `auth use`/`logout` idempotent per spec; logout with 2+ spaces and no flag → exit 2 listing them.
- [x] `doctor` all-green on a healthy space; each failure mode produces its named remediation (fixture-driven).
- [x] Spec updates merged for every "unverified" marker this plan touched.
- [x] Committed fixtures contain no real tenant identifiers (ids, slugs, names, emails).

## Risks / unknowns

- 2FA (TOTP) path can only be fixture-tested unless a 2FA account is available.
- Refresh-token lifetime/rotation semantics unknown — if Nexudus rotates refresh tokens per use, the store must persist the new one atomically.

## Notes

- **The `client_id` binding was the plan's real discovery.** Nexudus binds refresh tokens at issuance to a `client_id` header of `nexudus.portal.<email>`; without it, login succeeds but every later refresh returns `invalid_grant`. Cost two throwaway logins to isolate. Both grants now send it; spec'd in api/conventions.md.
- **Refresh rotates the pair on every use** (new 32-hex refresh token each time); the client persists the rotated pair before retrying. Access tokens live 14 days (`expires_in: 1209599`). Concurrent chains per client_id appear supported (the portal runs the same client_id from multiple browsers) — separate `auth login` per machine is the recommended multi-machine setup rather than copying the store.
- **Password channels** grew mid-plan (spec-first): `--password-stdin` (recommended), inline flag, or `NEXUDUS_AXI_PASSWORD` env — never a prompt, never stored.
- **No IANA timezone anywhere in the API** — `SimpleTimeZoneId` is a numeric ref with no public mapping, so `--timezone` at login is the real path and doctor flags its absence (spec updated from "unverified" to definitive).
- Invalid credentials on the password grant returned HTTP 500 (not 400) for a nonexistent account — noted in the spec; the AUTH_FAILED mapping covers 400/401 and 5xx falls through to SERVER_ERROR with a retry hint.
- Live verification ran against a real space membership; committed fixtures use only generic placeholders (verified by sweep).

## Follow-ups

- **Deferred to plan:** TOTP (2FA) login remains fixture-tested only — no 2FA account was available; exercise it live if one appears.
