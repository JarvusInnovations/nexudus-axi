# nexudus-axi

Agent-ergonomic CLI for the [Nexudus](https://www.nexudus.com/) coworking member portal — see what rooms are free, what a booking costs, and book it, from the terminal. Follows the [AXI standards](https://axi.md): token-efficient [TOON](https://toonformat.dev/) output, structured errors, definitive empty states, non-interactive everything.

Built for members of Nexudus-powered spaces (the portals at `*.spaces.nexudus.com`, often fronted by a custom domain). It speaks the member portal's own API with your member credentials — no operator/admin access involved.

```sh
npx -y nexudus-axi rooms free                  # which rooms are free right now?
npx -y nexudus-axi rooms free --from 4pm       # ...for my 4pm meeting?
npx -y nexudus-axi rooms day                   # every room's free ranges today
npx -y nexudus-axi book --room 'call room' --date tomorrow --from 2pm --to +1h --dry-run
npx -y nexudus-axi bookings                    # what do I have booked?
npx -y nexudus-axi credits                     # what can I spend?
```

## Install & connect

```sh
npm install -g nexudus-axi   # or keep using npx -y nexudus-axi

# Connect a space (the slug is its subdomain on spaces.nexudus.com).
# Pipe the password from a secret manager — it's exchanged for tokens and never stored:
op read 'op://Private/Nexudus/password' | \
  nexudus-axi auth login --space acme --email you@example.com --password-stdin --timezone America/New_York

nexudus-axi doctor           # five health checks, incl. a live read
```

Pass `--timezone` (IANA) at login — the Nexudus API doesn't expose the space's zone, and all booking math happens on the space's wall clock. Multiple spaces? Log in to each; `--space <slug>` selects one per command, `auth use <slug>` sets the default, and mutations require an explicit space when several are connected.

Tokens auto-refresh (rotating refresh tokens, ~14-day access tokens), so any machine used at least fortnightly stays logged in. Each machine should run its own `auth login`.

## The booking loop

- **`rooms`** — the catalog: every bookable resource with type, capacity, and rules. `rooms view <room>` for detail (rooms resolve by id or any name fragment).
- **`rooms free [--from <time>] [--to +1h]`** — which rooms fit a meeting window. Bare, it answers "where can I go right now" (snapped to the current quarter-hour). `busy` rows name the conflicting range.
- **`rooms day [--hours 8-20]`** — one row per room, free ranges at a glance.
- **`rooms favorites add <room>...`** — your go-to rooms become the default lens for `free`/`day` (`--all` widens; the catalog always shows everything).
- **`book --room <r> --date <d> --from <t> --to <t|+dur>`** — prices first (credits and/or dollars — always shown), then commits. `--dry-run` prices without committing. Credit-covered bookings only; card checkout stays in the portal.
- **`bookings [view|cancel <id>]`** — your bookings; cancel disclosing any late-cancellation fee, idempotently.
- **`credits`** — booking-credit balances (personal + team), passes, and service allowances.

## Ambient session context (pick one)

- **SessionStart hook** — `nexudus-axi setup hooks` injects the live home view (your bookings + credits) at the start of every Claude Code / Codex / OpenCode session.
- **Installable skill** — `skills/nexudus-axi/SKILL.md` (generated from the CLI's own reference, never drifts) for agents that load [Agent Skills](https://agentskills.io) on demand.

## Notes for the curious

- The member-portal API is undocumented; this tool's contract of record is reverse-engineered and lives in [`specs/api/`](specs/api/), including the load-bearing quirk that **all datetimes are the space's local wall-clock with a misleading literal `Z`** — never convert them through UTC.
- `CI` runs typecheck, build, tests, docs-drift check, and a no-credentials smoke test on every push.
- Env overrides for CI/cron: `NEXUDUS_AXI_TOKEN` + `NEXUDUS_AXI_SPACE`, `NEXUDUS_AXI_PASSWORD`, `NEXUDUS_AXI_CONFIG_DIR`, `NEXUDUS_AXI_DISABLE_HOOKS=1`.

## Development

Spec-driven: [`specs/`](specs/) declares desired state, [`plans/`](plans/) tracks the work DAG. `bun install`, `bun run dev`, `bun run test`, `bun run check`, `bun run docs`. MIT.
