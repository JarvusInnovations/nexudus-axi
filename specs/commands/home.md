# Command: home

## home (no args)

`nexudus-axi` with no arguments — the ambient view (AXI §8: content first, not a manual).

- Header: `bin:` + `description:` (SDK-injected), then `space:` (active) and `member:`.
- **Upcoming bookings** (next 7 days, max 5 rows): `bookings[N]{id,room,date,from,to}` — the "what do I have" half of the loop.
- **Credits**: one line per non-zero booking-credit balance (`credits: 3 remaining (expires 10/01)`), from the same read as `credits`.
- Unconfigured: definitive state + the exact `auth login` command shape — never an error dump.
- Multiple spaces stored: one line naming the others (`other_spaces: acme (use --space)`).
- `help[]` suggestions: `rooms slots <room> --date today`, `book --room <room> --date ... --from ... --to ...`, `bookings`, `credits`.

Budget: this renders at every session start once hooks are installed — keep it under ~25 lines. Deep data belongs to explicit commands.

## Principles

**Inherited** — [The booking loop is the center of gravity](../principles.md#the-booking-loop-is-the-center-of-gravity) — home answers "what's booked, what could I book" and nothing else.
