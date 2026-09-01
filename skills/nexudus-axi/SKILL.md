---
name: nexudus-axi
description: >-
  Book rooms at a Nexudus-powered coworking space — see which rooms are free
  for a meeting, view any room's day at a glance, check booking-credit
  balances, book a room (priced before commit), and list or cancel your
  bookings. Use when asked about coworking room bookings: "which rooms are
  free at 4pm", "book the call room tomorrow 2-3", "what do I have booked",
  "cancel my booking", "how many room credits do I have", or anything about
  a Nexudus member portal. Triggers on "Nexudus", "coworking", "book a room",
  "room credits", "meeting room", "call room", "day pass".
---

# nexudus-axi

An [AXI](https://axi.md)-compliant CLI for the Nexudus coworking member portal — see what rooms are free, what it costs, and book it. Token-efficient [TOON](https://toonformat.dev/) output; rooms resolve by id or name fragment; times are the space's local wall-clock (never UTC-converted).

> This skill is static. For live state at session start (your bookings and credits, no invocation needed), install the SessionStart hook instead (see the project README) — the hook and this skill are two paths to the same tool; you only need one.

Every example below runs via `npx -y nexudus-axi` so it works whether or not the package is installed globally. If `nexudus-axi` is already on PATH, drop the `npx -y` prefix.

## Setup

```sh
printf 'Password: ' && read -rs pw && echo && printf '%s' "$pw" | \
  npx -y nexudus-axi auth login --space <slug> --email <email> --password-stdin --timezone <iana>; unset pw
```

`<slug>` is the space's subdomain on spaces.nexudus.com. The password is exchanged for tokens and never stored; pipe it via `--password-stdin` (recommended), pass `--password`, or set `NEXUDUS_AXI_PASSWORD`. Pass `--timezone` (IANA) — the API doesn't expose the space's zone. Verify with `npx -y nexudus-axi doctor`.

### `nexudus-axi auth [login|status|use|logout] [<slug>] [flags]`

Connect a space with your member credentials, inspect or switch stored spaces

Flags:

- --email <email>       member login email (login)
- --password-stdin      read the password from stdin — pipe it from a secret manager; keeps it out of history (login)
- --password <pw>       inline password — lands in shell history; best kept to CI secret interpolation (login)
-                       (NEXUDUS_AXI_PASSWORD env is the third channel; the password is used once and never stored)
- --totp <code>         2FA code when the account requires it (login)
- --timezone <iana>     the space's timezone, when the API doesn't expose it (login)
- --refresh             re-validate tokens and refresh profile caches (status)

```sh
printf 'Password: ' && read -rs pw && echo && printf '%s' "$pw" | nexudus-axi auth login --space acme --email you@example.com --password-stdin; unset pw
npx -y nexudus-axi auth status
npx -y nexudus-axi auth use acme
npx -y nexudus-axi auth logout --space acme
```

### `nexudus-axi doctor`

Five ordered health checks — credentials, token, profile cache, resources read, hooks — exit 1 on any failure

```sh
npx -y nexudus-axi doctor
```

### `nexudus-axi setup hooks [status|uninstall] [--scope user|project]`

Manage the SessionStart hook that injects the home view at session start — bare `setup hooks` installs/repairs

Flags:

- --scope user|project   where the hook lives (default user): user = your home config, every session;
-                        project = the current repo's .claude/.codex/.opencode configs — travels with the repo

```sh
npx -y nexudus-axi setup hooks
npx -y nexudus-axi setup hooks --scope project
npx -y nexudus-axi setup hooks status --scope project
npx -y nexudus-axi setup hooks uninstall
```

## Booking loop

### `nexudus-axi rooms [list|view|slots|free|day|favorites] [<args>] [flags]`

Bookable resources — what exists, when it's free, and your go-to favorites

Flags:

- --type <name>      filter by resource type (list/free/day)
- --available        only resources available now (list)
- --date <when>      day to check — YYYY-MM-DD, today, tomorrow, +Nd (slots/free/day; default today)
- --days <n>         days of slots to fetch (slots; default 1)
- --interval <min>   slot granularity in minutes (slots; default 30)
- --from <time>      meeting start, e.g. 4pm or 16:00 (free; default: the current :15 block — i.e. right now)
- --to <time|+dur>   meeting end (free; default +1h)
- --hours <H-H>      day-view window in 24h hours (day; default 8-20)
- --all              consider every room, not just favorites (free/day)

```sh
npx -y nexudus-axi rooms
npx -y nexudus-axi rooms free --from 4pm            # which rooms fit my 4pm meeting?
npx -y nexudus-axi rooms day --date tomorrow        # every room's free ranges at a glance
npx -y nexudus-axi rooms favorites add 'call room'  # set your day-to-day lens
npx -y nexudus-axi rooms view <room>
npx -y nexudus-axi rooms slots <room> --date tomorrow
```

### `nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur> [--dry-run]`

Price and create a booking — always reports what it cost (credits and/or dollars)

Flags:

- --room <room>   required — room id or name
- --date <when>   required — YYYY-MM-DD, today, tomorrow, +Nd
- --from <time>   required — start, e.g. 14:00 or 2pm
- --to <time>     required — end, e.g. 15:00, 3pm, or a duration like +1h
- --dry-run       price the booking and stop — nothing is committed

```sh
npx -y nexudus-axi book --room 'Call Room' --date today --from 2pm --to +1h --dry-run
npx -y nexudus-axi book --room <id> --date 2026-09-05 --from 10:00 --to 12:00
```

### `nexudus-axi bookings [list|view|cancel] [<id>] [flags]`

Your bookings — upcoming by default, with cancellation (fee-aware)

Flags:

- --date <when>   narrow the list to one day
- --days <n>      window width from today (default 7)
- --all           include past bookings in the window

```sh
npx -y nexudus-axi bookings
npx -y nexudus-axi bookings view <id>
npx -y nexudus-axi bookings cancel <id>
```

### `nexudus-axi credits`

Booking-credit balances (personal and team) — what you can spend on rooms

```sh
npx -y nexudus-axi credits
```

## Getting help

Run `npx -y nexudus-axi <command> --help` for any command's full flag reference. Run `npx -y nexudus-axi` (no args, needs credentials) for the live home view — or skip the invocation entirely by installing the SessionStart hook (`npx -y nexudus-axi setup hooks`). `--space <slug>` on any command selects the space when several are connected.
