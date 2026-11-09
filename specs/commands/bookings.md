# Command: bookings

My existing bookings. Contract: [api/bookings § reading](../api/bookings.md#reading-my-bookings).

## bookings (list)

`nexudus-axi bookings [--date <when> | --days <n>] [--all] [--space <slug>]`

- Default window: today through +7 days. `--date` narrows to one day; `--days <n>` widens from today; `--all` widens the fetch to 30 days back through the forward window (the feed reaches at least a month back — verified live).
- Backed by `fullCalendarBookings` filtered to the caller's coworker id (cached, else read live from `/en/profile`; a response that isn't a list is `UNEXPECTED_RESPONSE`, never an empty calendar) (the feed carries every member's bookings, others anonymized — see [api/bookings](../api/bookings.md#reading-my-bookings)). `getUnpaidBookings` returns counts, not a list — a non-zero `BookingsToPay` surfaces as an `unpaid:` header note, not per-row flags; if that read fails, `unpaid: unknown (<CODE>: <message>)`.
- Default schema: `bookings[N]{id,room,date,from,to,status}` sorted by start, space wall-clock.
- Header: `space:`, resolved window. Empty is definitive.
- Suggestions: `bookings view <id>`, `bookings cancel <id>`, `book --room <room> ...`.

## bookings view

`nexudus-axi bookings view <id> [--space <slug>]`

- Backed by `BookingJson/{id}`. Detail: room, window, status, cost/credits as recorded, visitors, notes — plus the cancellation fee from `getCancellationFee` when the booking is upcoming, so the cancel decision is informed before it's made. If the fee lookup fails, the field reads `unknown (<CODE>: <message>)` — never `0`.

## bookings cancel

`nexudus-axi bookings cancel <id> [--space <slug>]`

- Checks `getCancellationFee` first and includes any fee in the output — cancelling is not free inside the late-cancellation window.
- A booking not on the caller's calendar window (−30 to +90 days) is checked by id (`BookingJson/{id}`): not found → `(no-op)`, exit 0; found → `OUT_OF_WINDOW`, exit 1 (the booking exists and was not cancelled).
- A fee response without its `hasCancellationFee` boolean reads `unknown (...)`, never 0.
- Cancels via `deletejson/{id}`; a response without a numeric `Status` is `UNEXPECTED_RESPONSE`, and the booking is then read back from the calendar — still present → `CANCEL_UNCONFIRMED`, exit 1. Output: `cancelled:` with id, room, window, `fee:` (0 or the amount, or `unknown (<CODE>: <message>)` when the pre-cancel lookup failed — never a guessed `0`).
- Already-cancelled → no-op, exit 0 (`already cancelled`). Unknown id → `NOT_FOUND`, exit 1.
- Mutation guard: with 2+ stored spaces, explicit `--space` required.

## Principles

**Inherited** — [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations); [Preview before commit](../principles.md#preview-before-commit-but-never-prompt) — the fee disclosure on `view`/`cancel` is the cancel-side of cost visibility.
