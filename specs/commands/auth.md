# Command: auth + doctor

## auth login

`nexudus-axi auth login --space <slug> --email <email> --password <pw> [--totp <code>] [--timezone <iana>]`

- Exchanges credentials via the password grant ([api/conventions § auth](../api/conventions.md#auth-oauth2-password--refresh-grants)), then bootstraps and caches the profile ([api/coworker](../api/coworker.md)): coworker id/name, business id/name, timezone.
- Writes `spaces/{slug}/token.json` (0600). **The password is never persisted.**
- `--space` accepts the bare slug (`acme`) or the full host (`acme.spaces.nexudus.com`) — normalized to the slug.
- `--timezone` overrides/supplies the space IANA timezone when the API doesn't expose it (see [time-and-timezone](../behaviors/time-and-timezone.md)).
- First stored space becomes the default automatically. Confirms with resolved identity (space, member name, email, plan name) + hook status.
- Missing `--password`: exit 2 with a structured instruction to pass it (suggest reading from a secret store into the flag; never prompt).
- Re-login over an existing space replaces its tokens — idempotent.

## auth status

`nexudus-axi auth status [--refresh]` — all stored spaces: `spaces[N]{space,member,email,default,token_age}` plus the env override if set (and which space it names). `--refresh` re-validates each space's token against `/en/profile` and refreshes profile caches. Definitive "no spaces stored" when empty.

## auth use

`nexudus-axi auth use <slug>` — sets the default space. Errors listing stored spaces when the slug isn't stored. Idempotent.

## auth logout

`nexudus-axi auth logout [--space <slug>]` — removes that space's stored tokens (default: the active space; with 2+ stored and no flag, exit 2 listing them). Idempotent no-op when absent. Notes when `NEXUDUS_AXI_TOKEN` is still set.

## doctor

`nexudus-axi doctor [--space <slug>]` — ordered checks `{check, status: ok|fail|skipped, detail}` preceded by `healthy:`:

1. **credentials** — stored/env for the active space? source?
2. **token** — `/en/profile?_resource=Coworker` succeeds? (auto-refresh exercised and reported if it fired)
3. **profile cache** — coworker id + business id + timezone cached? (missing timezone → remediation: `auth login --timezone`)
4. **resources read** — `/en/publicresources?_depth=3` returns ≥1 resource? (the canary for portal-contract drift, per [Reverse-engineered surface](../principles.md#reverse-engineered-surface-specd-honestly))
5. **hooks** — SessionStart hook installed and current? (remediation: `setup hooks`)

Exit 0 all-pass, else 1.

## Principles

**Inherited** — [A space is a tenant](../principles.md#a-space-is-a-tenant-never-guess-which-one); [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations); [Translate errors](../principles.md#translate-errors-never-leak-raw-api-noise) — refresh-failure vs bad-password vs TOTP-required each get distinct, actionable errors.
