# Command: bookings

My existing bookings. Contract: [api/bookings § reading](../api/bookings.md#reading-my-bookings).

## bookings (list)

`nexudus-axi bookings [--date <when> | --days <n>] [--all] [--space <slug>]`

- Default window: today through +7 days. `--date` narrows to one day; `--days <n>` widens from today; `--all` includes past bookings in the window's month (**unverified** how far back the calendar feed reaches — pin during implementation).
- Backed by `fullCalendarBookings`; unpaid bookings from `getUnpaidBookings` merge in flagged `unpaid: true`.
- Default schema: `bookings[N]{id,room,date,from,to,status}` sorted by start, space wall-clock.
- Header: `space:`, resolved window. Empty is definitive.
- Suggestions: `bookings view <id>`, `bookings cancel <id>`, `book --room <room> ...`.

## bookings view

`nexudus-axi bookings view <id> [--space <slug>]`

- Backed by `BookingJson/{id}`. Detail: room, window, status, cost/credits as recorded, visitors, notes — plus the cancellation fee from `getCancellationFee` when the booking is upcoming, so the cancel decision is informed before it's made.

## bookings cancel

`nexudus-axi bookings cancel <id> [--space <slug>]`

- Checks `getCancellationFee` first and includes any fee in the output — cancelling is not free inside the late-cancellation window.
- Cancels via `deletejson/{id}`. Output: `cancelled:` with id, room, window, `fee:` (0 or the amount).
- Already-cancelled → no-op, exit 0 (`already cancelled`). Unknown id → `NOT_FOUND`, exit 1.
- Mutation guard: with 2+ stored spaces, explicit `--space` required.

## Principles

**Inherited** — [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations); [Preview before commit](../principles.md#preview-before-commit-but-never-prompt) — the fee disclosure on `view`/`cancel` is the cancel-side of cost visibility.
