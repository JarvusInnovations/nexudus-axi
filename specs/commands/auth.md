# Command: auth + doctor

## auth login

`nexudus-axi auth login --space <slug> --email <email> (--password <pw> | --password-stdin) [--totp <code>] [--timezone <iana>]`

The password reaches the command through exactly one of three channels, checked in this order:

1. `--password <pw>` — inline; fine for CI secret interpolation, discouraged in interactive shells (it lands in history and `ps`). When both this and `--password-stdin` are passed → exit 2.
2. `--password-stdin` — read the password from stdin (trailing newline stripped). **The recommended human path**: pipe from a secret manager, e.g. `op read 'op://Private/Nexudus/password' | nexudus-axi auth login --space acme --email you@example.com --password-stdin`. Empty stdin → exit 2 with that pipe example.
3. `NEXUDUS_AXI_PASSWORD` env — fallback when neither flag is given.

None of the channels is a prompt — the command never blocks on a TTY (AXI §6). Whatever the channel, the password is exchanged for tokens and discarded.

- Exchanges credentials via the password grant ([api/conventions § auth](../api/conventions.md#auth-oauth2-password--refresh-grants)), then bootstraps and caches the profile ([api/coworker](../api/coworker.md)): coworker id/name, business id/name, timezone.
- Writes `spaces/{slug}/token.json` (0600). **The password is never persisted.**
- `--space` accepts the bare slug (`acme`) or the full host (`acme.spaces.nexudus.com`) — normalized to the slug.
- `--timezone` overrides/supplies the space IANA timezone when the API doesn't expose it (see [time-and-timezone](../behaviors/time-and-timezone.md)).
- First stored space becomes the default automatically. Confirms with resolved identity (space, member name, email, plan name) + hook status.
- No password through any channel: exit 2 with a structured instruction naming all three channels, leading with the `--password-stdin` pipe form (never prompt).
- Re-login over an existing space replaces its tokens — idempotent.

## auth status

`nexudus-axi auth status [--refresh]` — all stored spaces: `spaces[N]{space,member,email,default,token_age}` plus the env override if set (and which space it names). `--refresh` re-validates each space's token against `/en/profile` and refreshes profile caches. Definitive "no spaces stored" when empty.

## auth use

`nexudus-axi auth use <slug>` — sets the default space. Errors listing stored spaces when the slug isn't stored. Idempotent.

## auth logout

`nexudus-axi auth logout [--space <slug>]` — removes that space's stored tokens (default: the active space; with 2+ stored and no flag, exit 2 listing them). Idempotent no-op when absent. Notes when `NEXUDUS_AXI_TOKEN` is still set. Removes credentials only — per-space preferences (`prefs.json`) survive ([spaces-and-accounts § Preferences](../behaviors/spaces-and-accounts.md#preferences)).

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
