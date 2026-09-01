# Behavior: Spaces & Accounts

## Rule

Credentials are stored per **space** (Nexudus subdomain slug). Every command resolves exactly one active space before doing anything, in this order:

1. `NEXUDUS_AXI_TOKEN` env (+ `NEXUDUS_AXI_SPACE` naming the host it belongs to) — CI/cron override
2. `--space <slug>` flag — explicit per-command selection
3. Configured default (`auth use <slug>`)
4. The single stored space, when exactly one exists
5. Structured error listing stored spaces and how to pick one

**Mutations** (`book`, `bookings cancel`) with 2+ stored spaces require an explicit space (env or flag) — a default is not enough. A reservation landing in the wrong building is the failure mode this exists to prevent.

## Applies To

Every command except `setup`. Output of any command that touched the API names the space it acted on.

## Details

- A stored account is keyed by space slug and holds: `space` (slug), `base_url`, `email`, `access_token`, `refresh_token`, `token_obtained_at`, and the profile cache (`coworker_id`, `coworker_name`, `business_id`, `business_name`, `timezone`, `portal_url`, `cached_at`).
- The **password is never stored.** `auth login` exchanges it for tokens and discards it.
- Token refresh: on 401 (or a locally-detected stale token), refresh once via the refresh grant, persist the new pair, retry the request. A failed refresh yields `TOKEN_EXPIRED` with an `auth login --space <slug>` suggestion.
- `--space` is an always-allowed global flag (like `--help`): valid on every command, never reported unknown.
- Config layout follows slack-axi: `~/.config/nexudus-axi/config.json` (default space) + `~/.config/nexudus-axi/spaces/{slug}/token.json` (0600, dir 0700).
- One email may be a member of several spaces; each space login is independent (Nexudus tokens are per-host).

## Principles

**Inherited** — [A space is a tenant; never guess which one](../principles.md#a-space-is-a-tenant-never-guess-which-one) — this behavior is that principle operationalized.
