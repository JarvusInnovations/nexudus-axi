import { AxiError } from "axi-sdk-js";
import { ROOMS_FLAGS, bool, parseSubcommand, requirePositional, str, type Parsed } from "../flags.js";
import { readPrefs, writePrefs } from "../config.js";
import { fetchResources, resolveRoom, stripHtml, amenities, rateOf, type Resource } from "../nexudus/resolve.js";
import { compressSlots, fetchAvailability, type SlotRange } from "../nexudus/slots.js";
import { formatWallDate, nowInZone, parseDateFlag, renderTime, resolveWindow, snapToQuarterHour } from "../time/wallclock.js";
import {
  compact,
  computed,
  field,
  joinBlocks,
  renderHelp,
  renderList,
  renderListResponse,
  renderObject,
} from "../output/index.js";
import { activeSpaceFrom } from "./auth.js";

/** `rooms [list|view|slots|free|day|favorites]` — see `specs/commands/rooms.md`. */

export async function roomsCommand(args: string[]): Promise<string> {
  const { sub, parsed } = parseSubcommand("rooms", args, ROOMS_FLAGS, "list");
  switch (sub) {
    case "list":
      return roomsList(parsed);
    case "view":
      return roomsView(parsed);
    case "slots":
      return roomsSlots(parsed);
    case "free":
      return roomsFree(parsed);
    case "day":
      return roomsDay(parsed);
    case "favorites":
      return roomsFavorites(parsed);
    default:
      // Unreachable — parseSubcommand already validated `sub`.
      throw new AxiError(`unknown rooms subcommand "${sub}"`, "VALIDATION_ERROR", []);
  }
}

// ── The favorites lens (specs/commands/rooms.md § rooms favorites) ──
function favoriteIds(space: string): number[] {
  return readPrefs(space).favorite_rooms ?? [];
}

/**
 * The default candidate set for finding commands: favorites when configured,
 * all rooms otherwise; `--all` always widens. Never applied to the catalog
 * commands ("a lens, not a wall").
 */
function applyLens(
  rooms: Resource[],
  space: string,
  all: boolean,
): { candidates: Resource[]; lens: "favorites" | "all" } {
  const favs = favoriteIds(space);
  if (all || favs.length === 0) return { candidates: rooms, lens: "all" };
  const set = new Set(favs);
  const candidates = rooms.filter((r) => set.has(r.Id));
  // Every favorite gone stale → fall back to all rather than an empty search.
  if (candidates.length === 0) return { candidates: rooms, lens: "all" };
  return { candidates, lens: "favorites" };
}

function typeFilter(rooms: Resource[], type: string | undefined): Resource[] {
  if (!type) return rooms;
  const needle = type.toLowerCase();
  return rooms.filter((r) => (r.ResourceTypeName ?? "").toLowerCase().includes(needle));
}

const LIST_SCHEMA = [
  computed("id", (r) => r.Id),
  computed("name", (r) => r.Name),
  computed("type", (r) => r.ResourceTypeName ?? ""),
  computed("capacity", (r) => r.Allocation ?? ""),
  computed("rate", (r) => rateOf(r as Resource)),
];

async function roomsList(parsed: Parsed): Promise<string> {
  const active = activeSpaceFrom(parsed);
  let rooms = typeFilter(await fetchResources(active), str(parsed, "--type"));
  const type = str(parsed, "--type");

  const availableOnly = bool(parsed, "--available");
  if (availableOnly) rooms = rooms.filter((r) => r.IsAvailable === true);

  // The catalog always shows every room; favorites just sort first and gain
  // a fav column when any exist (specs/commands/rooms.md § rooms favorites).
  const favs = new Set(favoriteIds(active.space));
  const schema = [...LIST_SCHEMA];
  if (favs.size > 0) {
    rooms = [...rooms].sort((a, b) => Number(favs.has(b.Id)) - Number(favs.has(a.Id)));
    schema.push(computed("fav", (r) => (favs.has(r.Id as number) ? true : "")));
  }

  return renderListResponse({
    header: compact({
      space: active.space,
      count: rooms.length,
      ...(availableOnly ? { note: "available now (server default window) — use `rooms slots` for a specific time" } : {}),
    }),
    name: "rooms",
    items: rooms as unknown as Array<Record<string, unknown>>,
    schema,
    emptyMessage: availableOnly
      ? `no rooms are available right now on ${active.space} — try \`rooms slots <room> --date <when>\` for a specific window`
      : type
        ? `no rooms match type "${type}" on ${active.space}`
        : `no bookable rooms visible on ${active.space}`,
    suggestions: [
      "Run `nexudus-axi rooms view <room>` for rules and amenities",
      "Run `nexudus-axi rooms slots <room> --date <when>` to see free times",
      "Run `nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur> --dry-run` to price a booking",
    ],
  });
}

/** Booking-rule fields rendered by `view`, only when the space sets them. */
function rules(r: Resource): Record<string, unknown> {
  return compact({
    min_booking_minutes: r.MinBookingLength ?? undefined,
    max_booking_minutes: r.MaxBookingLength ?? undefined,
    book_in_advance_limit: r.BookInAdvanceLimit ?? undefined,
    late_booking_limit: r.LateBookingLimit ?? undefined,
    late_cancellation_limit: r.LateCancellationLimit ?? undefined,
    interval_limit: r.IntervalLimit ?? undefined,
    allows_multiple_bookings: r.AllowMultipleBookings === true ? true : undefined,
    requires_confirmation: r.RequiresConfirmation === true ? true : undefined,
  });
}

const DESCRIPTION_PREVIEW = 600;

async function roomsView(parsed: Parsed): Promise<string> {
  const ref = requirePositional(parsed, 0, "room", "nexudus-axi rooms view <room-id-or-name>");
  const active = activeSpaceFrom(parsed);
  const room = resolveRoom(await fetchResources(active), ref);

  const description = stripHtml(room.Description ?? "");
  const truncatedDescription =
    description.length > DESCRIPTION_PREVIEW
      ? `${description.slice(0, DESCRIPTION_PREVIEW - 1)}…\n... (truncated, ${description.length} chars total)`
      : description;

  const blocks = [
    renderObject(
      compact({
        space: active.space,
        id: room.Id,
        guid: room.UniqueId,
        name: room.Name,
        type: room.ResourceTypeName ?? undefined,
        capacity: room.Allocation ?? undefined,
        rate: rateOf(room) || undefined,
        amenities: amenities(room).join(", ") || undefined,
        description: truncatedDescription || undefined,
      }),
    ),
  ];
  const ruleFields = rules(room);
  if (Object.keys(ruleFields).length > 0) blocks.push(renderObject({ rules: ruleFields }));
  blocks.push(
    renderHelp([
      `Run \`nexudus-axi rooms slots ${room.Id} --date <when>\` to see free times`,
      `Run \`nexudus-axi book --room ${room.Id} --date <when> --from <time> --to <time|+dur> --dry-run\` to price a booking`,
    ]),
  );
  return joinBlocks(...blocks);
}

const RANGE_SCHEMA = [field("from"), field("to")];

async function roomsSlots(parsed: Parsed): Promise<string> {
  const ref = requirePositional(parsed, 0, "room", "nexudus-axi rooms slots <room-id-or-name> [--date <when>]");
  const active = activeSpaceFrom(parsed);

  const days = Number(str(parsed, "--days", "1"));
  const interval = Number(str(parsed, "--interval", "30"));
  if (!Number.isInteger(days) || days < 1 || days > 14) {
    throw new AxiError("--days must be an integer from 1 to 14", "VALIDATION_ERROR", []);
  }
  if (!Number.isInteger(interval) || interval < 5 || interval > 240) {
    throw new AxiError("--interval must be minutes from 5 to 240", "VALIDATION_ERROR", []);
  }

  const zone = active.stored?.profile_cache?.timezone;
  const date = parseDateFlag(str(parsed, "--date", "today"), zone);
  const room = resolveRoom(await fetchResources(active), ref);

  const slots = await fetchAvailability(active, room.UniqueId, formatWallDate(date), days, interval);
  const { free, booked } = compressSlots(slots, interval);

  const short = (range: { from: string; to: string }) => ({
    from: range.from.replace("T", " "),
    to: range.to.replace("T", " "),
  });

  const blocks = [
    renderObject(
      compact({
        space: active.space,
        room: room.Name,
        date: formatWallDate(date),
        days: days > 1 ? days : undefined,
        timezone: zone ?? "(machine zone — set the space's with `auth login --timezone <iana>`)",
      }),
    ),
  ];
  if (free.length === 0) {
    blocks.push(renderObject({ free: `none — fully booked on ${formatWallDate(date)}` }));
  } else {
    blocks.push(renderList("free", free.map(short), RANGE_SCHEMA));
  }
  if (booked.length > 0) {
    blocks.push(renderList("booked", booked.map(short), RANGE_SCHEMA));
  }
  blocks.push(
    renderHelp([
      `Run \`nexudus-axi book --room ${room.Id} --date ${formatWallDate(date)} --from <time> --to <time|+dur>\` to book one of the free ranges`,
    ]),
  );
  return joinBlocks(...blocks);
}

// ── rooms free — "which rooms are available for my 4pm meeting" ─────
const FREE_INTERVAL = 15; // Nexudus's smallest booking unit

const FREE_SCHEMA = [
  computed("id", (r) => r.Id),
  computed("name", (r) => r.Name),
  computed("type", (r) => r.ResourceTypeName ?? ""),
  computed("capacity", (r) => r.Allocation ?? ""),
];

const BUSY_SCHEMA = [
  computed("id", (r) => (r.room as Resource).Id),
  computed("name", (r) => (r.room as Resource).Name),
  computed("conflict", (r) => r.conflict),
];

/** Booked ranges from the room's slot grid that overlap [fromApi, toApi). */
function conflictsIn(booked: SlotRange[], from: string, to: string): SlotRange[] {
  return booked.filter((b) => b.from < to && b.to > from);
}

async function roomsFree(parsed: Parsed): Promise<string> {
  const active = activeSpaceFrom(parsed);
  const zone = active.stored?.profile_cache?.timezone;

  // Bare `rooms free` answers "where can I go RIGHT NOW": --from floors to
  // the current quarter-hour block on the space's clock, rounding up within
  // 3 minutes of the next block (specs/commands/rooms.md § rooms free).
  let fromFlag = str(parsed, "--from");
  if (!fromFlag) {
    const snapped = snapToQuarterHour(nowInZone(zone));
    if (snapped.h > 23) {
      throw new AxiError("It's almost midnight at the space — pass an explicit window", "VALIDATION_ERROR", [
        "nexudus-axi rooms free --date tomorrow --from <time>",
      ]);
    }
    fromFlag = renderTime(snapped);
  }
  const window = resolveWindow({
    date: str(parsed, "--date"),
    from: fromFlag,
    to: str(parsed, "--to", "+1h"),
    zone,
  });

  const rooms = typeFilter(await fetchResources(active), str(parsed, "--type"));
  const { candidates, lens } = applyLens(rooms, active.space, bool(parsed, "--all"));

  const date = formatWallDate(window.date);
  // Wall-clock strings in the slot grid carry no seconds — trim ours to match
  // so lexicographic comparison is apples-to-apples.
  const fromKey = window.fromApi.slice(0, 16);
  const toKey = window.toApi.slice(0, 16);

  const checked = await Promise.all(
    candidates.map(async (room) => {
      const slots = await fetchAvailability(active, room.UniqueId, date, 1, FREE_INTERVAL);
      const inWindow = slots.filter((s) => {
        const key = s.DateTime.slice(0, 16);
        return key >= fromKey && key < toKey;
      });
      const { booked } = compressSlots(slots, FREE_INTERVAL);
      const conflicts = conflictsIn(booked, fromKey, toKey);
      // Free = the grid covers the window and nothing booked overlaps it.
      const free = inWindow.length > 0 && conflicts.length === 0;
      return { room, free, conflicts };
    }),
  );

  const freeRooms = checked.filter((c) => c.free).map((c) => c.room);
  const busyRooms = checked
    .filter((c) => !c.free)
    .map((c) => ({
      room: c.room,
      conflict: c.conflicts.length
        ? c.conflicts.map((b) => `${b.from.slice(11, 16)}–${b.to.slice(11, 16)}`).join(", ")
        : "no bookable slots in the window",
    }));

  const blocks = [
    renderObject(
      compact({
        space: active.space,
        date,
        window: `${renderTime(window.from)}–${renderTime(window.to)}`,
        timezone: zone ?? "(machine zone)",
        lens,
      }),
    ),
  ];
  if (freeRooms.length === 0) {
    blocks.push(
      renderObject({
        free:
          lens === "favorites"
            ? "none of your favorite rooms is free — re-run with --all to consider every room"
            : "no rooms are free for that window",
      }),
    );
  } else {
    blocks.push(renderList("free", freeRooms as unknown as Array<Record<string, unknown>>, FREE_SCHEMA));
  }
  if (busyRooms.length > 0) {
    blocks.push(renderList("busy", busyRooms as unknown as Array<Record<string, unknown>>, BUSY_SCHEMA));
  }
  const first = freeRooms[0];
  blocks.push(
    renderHelp([
      first
        ? `Run \`nexudus-axi book --room ${first.Id} --date ${date} --from ${renderTime(window.from)} --to ${renderTime(window.to)}\` to book`
        : `Run \`nexudus-axi rooms day --date ${date}\` to see when rooms open up`,
    ]),
  );
  return joinBlocks(...blocks);
}

// ── rooms day — the all-room day view ───────────────────────────────
function parseHours(value: string): { start: number; end: number } {
  const m = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    throw new AxiError(`"${value}" is not an hours window`, "VALIDATION_ERROR", [
      "--hours takes start-end in 24h hours, e.g. --hours 8-20 or --hours 0-24",
    ]);
  }
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start >= end || start < 0 || end > 24) {
    throw new AxiError(`--hours ${value} is empty or out of range`, "VALIDATION_ERROR", [
      "start must be before end, within 0-24",
    ]);
  }
  return { start, end };
}

const DAY_SCHEMA = [
  computed("id", (r) => r.id),
  computed("name", (r) => r.name),
  computed("free", (r) => r.free),
];

async function roomsDay(parsed: Parsed): Promise<string> {
  const active = activeSpaceFrom(parsed);
  const zone = active.stored?.profile_cache?.timezone;
  const date = parseDateFlag(str(parsed, "--date", "today"), zone);
  const hours = parseHours(str(parsed, "--hours", "8-20"));

  const rooms = typeFilter(await fetchResources(active), str(parsed, "--type"));
  const { candidates, lens } = applyLens(rooms, active.space, bool(parsed, "--all"));

  const day = formatWallDate(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const winFrom = `${day}T${pad(hours.start)}:00`;
  const winTo = hours.end === 24 ? `${day}T23:59` : `${day}T${pad(hours.end)}:00`;
  const winLabel = `${pad(hours.start)}:00–${hours.end === 24 ? "24:00" : `${pad(hours.end)}:00`}`;

  const rows = await Promise.all(
    candidates.map(async (room) => {
      const slots = await fetchAvailability(active, room.UniqueId, day, 1, FREE_INTERVAL);
      const { free } = compressSlots(slots, FREE_INTERVAL);
      // Clip each free range to the hours window on this date.
      const clipped = free
        .map((r) => ({ from: r.from > winFrom ? r.from : winFrom, to: r.to < winTo ? r.to : winTo }))
        .filter((r) => r.from < r.to);
      const covers =
        clipped.length === 1 && clipped[0]!.from === winFrom && clipped[0]!.to === winTo;
      const label = covers
        ? "all day"
        : clipped.length === 0
          ? "booked out"
          : clipped
              .map((r) => `${r.from.slice(11, 16)}–${r.to === `${day}T23:59` ? "24:00" : r.to.slice(11, 16)}`)
              .join(", ");
      return { id: room.Id, name: room.Name, free: label };
    }),
  );

  return renderListResponse({
    header: compact({
      space: active.space,
      date: day,
      hours: winLabel,
      timezone: zone ?? "(machine zone)",
      lens,
    }),
    name: "rooms_day",
    items: rows as unknown as Array<Record<string, unknown>>,
    schema: DAY_SCHEMA,
    emptyMessage: `no rooms in the ${lens} lens — run with --all`,
    suggestions: [
      `Run \`nexudus-axi rooms free --from <time>\` to check a specific meeting window`,
      `Run \`nexudus-axi book --room <id> --date ${day} --from <time> --to <time|+dur>\` to book`,
    ],
  });
}

// ── rooms favorites — the per-space lens list ───────────────────────
async function roomsFavorites(parsed: Parsed): Promise<string> {
  const active = activeSpaceFrom(parsed);
  const action = parsed.positional[0];
  const refs = parsed.positional.slice(1);
  const prefs = readPrefs(active.space);
  const current = prefs.favorite_rooms ?? [];

  if (action === undefined) {
    if (current.length === 0) {
      return joinBlocks(
        renderObject({ favorites: "no favorites — `rooms free` and `rooms day` consider all rooms" }),
        renderHelp(["Run `nexudus-axi rooms favorites add <room>...` to set your go-to rooms"]),
      );
    }
    const rooms = await fetchResources(active);
    const byId = new Map(rooms.map((r) => [r.Id, r]));
    const rows = current.map((id) => {
      const room = byId.get(id);
      return { id, name: room?.Name ?? "(no longer exists on the space)", type: room?.ResourceTypeName ?? "" };
    });
    return joinBlocks(
      renderObject({ space: active.space }),
      renderList("favorites", rows as unknown as Array<Record<string, unknown>>, [
        computed("id", (r) => r.id),
        computed("name", (r) => r.name),
        computed("type", (r) => r.type),
      ]),
      renderHelp([
        "Favorites are the default lens for `rooms free` and `rooms day` (--all widens)",
        "Run `nexudus-axi rooms favorites remove <room>` or `... clear` to change the list",
      ]),
    );
  }

  if (action === "clear") {
    writePrefs(active.space, { ...prefs, favorite_rooms: [] });
    return renderObject({
      status: current.length === 0 ? "no favorites were set (no-op)" : `cleared ${current.length} favorite(s)`,
    });
  }

  if (action !== "add" && action !== "remove") {
    throw new AxiError(`unknown favorites action "${action}"`, "VALIDATION_ERROR", [
      "valid actions: add <room>..., remove <room>..., clear — or no action to list",
    ]);
  }
  if (refs.length === 0) {
    throw new AxiError(`favorites ${action} needs at least one room`, "USAGE", [
      `nexudus-axi rooms favorites ${action} <room-id-or-name>...`,
    ]);
  }

  const rooms = await fetchResources(active);
  const resolved = refs.map((ref) => resolveRoom(rooms, ref));
  const next = new Set(current);
  const changed: string[] = [];
  for (const room of resolved) {
    const has = next.has(room.Id);
    if (action === "add" && !has) {
      next.add(room.Id);
      changed.push(room.Name);
    } else if (action === "remove" && has) {
      next.delete(room.Id);
      changed.push(room.Name);
    }
  }
  writePrefs(active.space, { ...prefs, favorite_rooms: [...next] });

  return joinBlocks(
    renderObject({
      status:
        changed.length === 0
          ? `nothing to ${action} — already ${action === "add" ? "favorites" : "absent"} (no-op)`
          : `${action === "add" ? "added" : "removed"}: ${changed.join(", ")}`,
      favorites: [...next].length,
    }),
    renderHelp(["Run `nexudus-axi rooms favorites` to see the list"]),
  );
}
