# Command: rooms

Bookable resources and their availability. Contract: [api/resources](../api/resources.md).

## rooms (list)

`nexudus-axi rooms [--type <name>] [--available] [--space <slug>]`

- Default schema: `rooms[N]{id,name,type,capacity,rate}` — `capacity` from `Allocation`; `rate` from the structured price fields (`PriceFormatted`, else `Price` when > 0), and blank when the space doesn't populate them (verified live: a space can leave `Price: 0`/`PriceFormatted: null` and describe pricing only in the description HTML — the authoritative cost is `book --dry-run`'s preview).
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

## rooms free

`nexudus-axi rooms free --from <time> [--to <time|+dur>] [--date <when>] [--type <name>] [--all] [--space <slug>]`

Answers "which rooms are available for my 4pm meeting" in one call.

- Defaults: `--date today`, `--to +1h` (the meeting-length default). `--from` is required.
- **Candidate set = the favorites lens** ([§ rooms favorites](#rooms-favorites)): favorites when configured, else all visible rooms; `--all` forces all; `--type` filters either set.
- A room is free when every availability slot overlapping the half-open window is `Available`.
- Output: `free[N]{id,name,type,capacity}` then `busy[N]{id,name,conflict}` (conflict = the booked range overlapping the window, wall-clock). Header echoes `space:`, `date:`, `window:`, `timezone:`, and `lens: favorites|all`.
- Empty free-set is definitive and suggests `--all` when the lens was favorites.
- Suggestions: `book --room <id> --date <date> --from <from> --to <to>` carrying the resolved window verbatim.

## rooms day

`nexudus-axi rooms day [--date <when>] [--hours <H-H>] [--type <name>] [--all] [--space <slug>]`

The all-room day view — one row per room, free ranges at a glance.

- Defaults: `--date today`, `--hours 8-20` (the day-planning window; `--hours 0-24` for everything). Candidate set = the favorites lens, `--all` for every room.
- Output: `rooms_day[N]{id,name,free}` — free ranges clipped to the hours window and joined (`09:00–12:30, 14:00–18:00`); a room free for the whole view window renders `all day`; a fully-booked one renders `booked out`.
- Header echoes `space:`, `date:`, `hours:`, `timezone:`, `lens:`.
- Suggestions: `rooms free --from <time>`, `book ...`.

## rooms favorites

`nexudus-axi rooms favorites [add <room>... | remove <room>... | clear]`

A per-space list of go-to rooms — the day-to-day lens that hides specialty resources (boardrooms, studios) without losing them.

- `rooms favorites` — the current list (definitive empty state naming the effect: "no favorites — free/day consider all rooms").
- `add`/`remove` take one or more room refs (id or name, resolved as `rooms view`); idempotent (re-adding is a no-op, exit 0). `clear` empties the list.
- Storage: `spaces/{slug}/prefs.json` per [spaces-and-accounts](../behaviors/spaces-and-accounts.md#preferences) — favorites survive logout/login.
- Effect: `rooms free` and `rooms day` default their candidate set to favorites when any are set (`--all` widens); the `rooms` list always shows every room but orders favorites first and adds a `fav` column when any exist.
- A favorite that no longer resolves (room removed by the space) is skipped with a note, never an error.

## Principles

**Inherited** — [The booking loop is the center of gravity](../principles.md#the-booking-loop-is-the-center-of-gravity) — `slots` output is shaped for the immediately-following `book` call; [Local wall-clock in/out](../principles.md#local-wall-clock-in-local-wall-clock-out--never-help-with-utc).

**Local:**

- **Favorites are a lens, not a wall.** They narrow the *default* candidate set of finding commands (`free`, `day`); they never hide rooms from the catalog (`rooms`, `view`, `slots`, `book` all address every room), and every lensed output names the lens and the `--all` escape. A filter an agent can't see or widen is a data-integrity bug, not a convenience.
