import { AxiError } from "axi-sdk-js";
import { ROOMS_FLAGS, bool, parseSubcommand, requirePositional, str, type Parsed } from "../flags.js";
import { fetchResources, resolveRoom, stripHtml, amenities, rateOf, type Resource } from "../nexudus/resolve.js";
import { compressSlots, fetchAvailability } from "../nexudus/slots.js";
import { formatWallDate, parseDateFlag } from "../time/wallclock.js";
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

/** `rooms [list|view|slots]` — see `specs/commands/rooms.md`. */

export async function roomsCommand(args: string[]): Promise<string> {
  const { sub, parsed } = parseSubcommand("rooms", args, ROOMS_FLAGS, "list");
  switch (sub) {
    case "list":
      return roomsList(parsed);
    case "view":
      return roomsView(parsed);
    case "slots":
      return roomsSlots(parsed);
    default:
      // Unreachable — parseSubcommand already validated `sub`.
      throw new AxiError(`unknown rooms subcommand "${sub}"`, "VALIDATION_ERROR", []);
  }
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
  let rooms = await fetchResources(active);

  const type = str(parsed, "--type");
  if (type) {
    const needle = type.toLowerCase();
    rooms = rooms.filter((r) => (r.ResourceTypeName ?? "").toLowerCase().includes(needle));
  }
  const availableOnly = bool(parsed, "--available");
  if (availableOnly) rooms = rooms.filter((r) => r.IsAvailable === true);

  return renderListResponse({
    header: compact({
      space: active.space,
      count: rooms.length,
      ...(availableOnly ? { note: "available now (server default window) — use `rooms slots` for a specific time" } : {}),
    }),
    name: "rooms",
    items: rooms as unknown as Array<Record<string, unknown>>,
    schema: LIST_SCHEMA,
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
