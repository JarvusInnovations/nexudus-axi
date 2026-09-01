# Command: credits

Booking-credit and allowance balances. Contract: [api/coworker § benefits](../api/coworker.md#booking-credits--benefits).

## credits

`nexudus-axi credits [--space <slug>]`

- Default schema: `credits[N]{scope,name,remaining,total,expires}` — `scope` is `personal` \| `team`; only rows with `CaneBeUsedForBookings` true (yes, the API misspells it).
- Time passes and extra services render as their own sections (`passes[N]`, `services[N]`) **only when non-empty** — most members only carry booking credits, and empty sections are noise.
- Header: `space:`. Zero balances are definitive (`credits: no booking credits on <space>`).
- Suggestions: `book --room <id> ...` (credits exist to be spent), `rooms`.

## Principles

**Inherited** — [The booking loop is the center of gravity](../principles.md#the-booking-loop-is-the-center-of-gravity) — credits are context for "can I afford this booking", not an accounting report.
