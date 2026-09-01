# Command: rooms

Bookable resources and their availability. Contract: [api/resources](../api/resources.md).

## rooms (list)

`nexudus-axi rooms [--type <name>] [--available] [--space <slug>]`

- Default schema: `rooms[N]{id,name,type,capacity,rate}` — `rate` is the human cost line derived from resource metadata (e.g. `1 credit/hr or $10/hr`), `capacity` from `Allocation`.
- Sorted by `DisplayOrder`; only `Visible` resources.
- `--type` filters by `ResourceTypeName` (case-insensitive substring).
- `--available` filters to `IsAvailable: true` — labeled as "available now (server default window)", since point-in-time flags don't answer arbitrary windows (see the caveat in [api/resources](../api/resources.md#list-bookable-resources)).
- Header: `space:` + `count:`.
- Suggestions: `rooms view <id>`, `rooms slots <id> --date <when>`, `book --room <id> ...`.

## rooms view

`nexudus-axi rooms view <room> [--space <slug>]`

- `<room>` accepts a numeric `Id` or a name (case-insensitive substring; ambiguous match → exit 2 listing candidates).
- Detail: identity, type, capacity, description (HTML stripped to text, truncated per AXI §3), amenity list (true flags only), full booking rules (min/max length, advance/late limits, cancellation limit, requires-confirmation), rate, and both `id` and `guid`.
- Suggestions: `rooms slots <id>`, `book --room <id> ...`.

## rooms slots

`nexudus-axi rooms slots <room> [--date <when>] [--days <n>] [--interval <min>] [--space <slug>]`

- Defaults: `--date today`, `--days 1`, `--interval 30`. Date forms per [time-and-timezone](../behaviors/time-and-timezone.md).
- Backed by `GetAvailabilityAtWithUser` using the resource's `UniqueId` (resolved from the same lookup as `rooms view` — the agent never handles the GUID).
- Output compresses the raw slot list into **contiguous ranges**: `free[N]{from,to}` and `booked[N]{from,to}` in space wall-clock — an agent wants "2:00–5:30 PM is open", not 48 slot rows.
- Header: `space:`, `room:`, `date:` (resolved), `timezone:`.
- Empty/fully-booked days are definitive (`free: none — fully booked on <date>`).
- Suggestions: `book --room <id> --date <date> --from <time> --to <time>`.

## Principles

**Inherited** — [The booking loop is the center of gravity](../principles.md#the-booking-loop-is-the-center-of-gravity) — `slots` output is shaped for the immediately-following `book` call; [Local wall-clock in/out](../principles.md#local-wall-clock-in-local-wall-clock-out--never-help-with-utc).
