import { AxiError } from "axi-sdk-js";
import { BOOKINGS_FLAGS, bool, parseSubcommand, requirePositional, str, type Parsed } from "../flags.js";
import { nexudusRequest } from "../nexudus/client.js";
import {
  bookingStatus,
  fetchMyBookings,
  fetchUnpaidCounts,
  splitWallclock,
} from "../nexudus/mybookings.js";
import { addDays, formatWallDate, parseDateFlag, renderWallclock, todayInZone } from "../time/wallclock.js";
import { compact, computed, joinBlocks, renderHelp, renderListResponse, renderObject } from "../output/index.js";
import { activeSpaceFrom } from "./auth.js";
import { notImplemented } from "./stub.js";

/** `bookings [list|view|cancel]` — see `specs/commands/bookings.md`. */

export async function bookingsCommand(args: string[]): Promise<string> {
  const { sub, parsed } = parseSubcommand("bookings", args, BOOKINGS_FLAGS, "list");
  switch (sub) {
    case "list":
      return bookingsList(parsed);
    case "view":
      return bookingsView(parsed);
    case "cancel":
      // Mutation — lands with book-write.
      return notImplemented("bookings cancel");
    default:
      // Unreachable — parseSubcommand already validated `sub`.
      throw new AxiError(`unknown bookings subcommand "${sub}"`, "VALIDATION_ERROR", []);
  }
}

const LIST_SCHEMA = [
  computed("id", (r) => r.id),
  computed("room", (r) => r.resourceName ?? ""),
  computed("date", (r) => splitWallclock(String(r.start)).date),
  computed("from", (r) => splitWallclock(String(r.start)).time),
  computed("to", (r) => splitWallclock(String(r.end)).time),
  computed("status", (r) => bookingStatus(r as never)),
];

async function bookingsList(parsed: Parsed): Promise<string> {
  const active = activeSpaceFrom(parsed);
  const zone = active.stored?.profile_cache?.timezone;

  const dateFlag = str(parsed, "--date");
  const daysFlag = str(parsed, "--days");
  const all = bool(parsed, "--all");
  if (dateFlag && daysFlag) {
    throw new AxiError("--date and --days are mutually exclusive", "VALIDATION_ERROR", [
      "--date <when> shows one day; --days <n> widens from today",
    ]);
  }

  const today = todayInZone(zone);
  let from = today;
  let to = addDays(today, 7);
  let label = "today → +7d";
  if (dateFlag) {
    from = parseDateFlag(dateFlag, zone);
    to = from;
    label = formatWallDate(from);
  } else if (daysFlag) {
    const n = Number(daysFlag);
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      throw new AxiError("--days must be an integer from 1 to 90", "VALIDATION_ERROR", []);
    }
    to = addDays(today, n);
    label = `today → +${n}d`;
  }
  if (all) {
    from = addDays(from, -30);
    label = `${label} (+30d back)`;
  }

  const rows = await fetchMyBookings(active, formatWallDate(from), formatWallDate(to));
  const unpaid = await fetchUnpaidCounts(active).catch(() => ({}) as { BookingsToPay?: number });

  return renderListResponse({
    header: compact({
      space: active.space,
      window: label,
      timezone: zone ?? "(machine zone)",
      ...(unpaid.BookingsToPay ? { unpaid: `${unpaid.BookingsToPay} booking(s) awaiting payment — see the portal` } : {}),
    }),
    name: "bookings",
    items: rows as unknown as Array<Record<string, unknown>>,
    schema: LIST_SCHEMA,
    emptyMessage: `no bookings for ${label} on ${active.space}`,
    suggestions: [
      "Run `nexudus-axi bookings view <id>` for detail incl. the cancellation fee",
      "Run `nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur>` to book",
    ],
  });
}

/**
 * BookingJson's exact shape is unverified until book-write's live run
 * (specs/api/bookings.md) — this renders defensively from the fields the
 * portal client is known to read, and falls back to the calendar row.
 */
async function bookingsView(parsed: Parsed): Promise<string> {
  const idRaw = requirePositional(parsed, 0, "booking id", "nexudus-axi bookings view <id>");
  if (!/^\d+$/.test(idRaw)) {
    throw new AxiError(`"${idRaw}" is not a booking id`, "VALIDATION_ERROR", [
      "Run `nexudus-axi bookings` to list your bookings and their ids",
    ]);
  }
  const active = activeSpaceFrom(parsed);

  const booking = await nexudusRequest<Record<string, unknown>>(active, `/en/bookings/BookingJson/${idRaw}`);

  const fee = await nexudusRequest<Record<string, unknown>>(active, "/en/bookings/getCancellationFee", {
    query: { bookingId: idRaw },
  }).catch(() => undefined);
  const feeValue =
    fee && typeof fee === "object"
      ? ((fee.Fee ?? fee.fee ?? fee.Amount ?? fee.amount) as number | undefined)
      : undefined;

  const fromTime = booking.FromTime ?? booking.fromTime;
  const toTime = booking.ToTime ?? booking.toTime;

  return joinBlocks(
    renderObject(
      compact({
        space: active.space,
        id: Number(idRaw),
        room: (booking.ResourceName as string) ?? (booking.resourceName as string) ?? undefined,
        from: typeof fromTime === "string" ? renderWallclock(fromTime) : undefined,
        to: typeof toTime === "string" ? renderWallclock(toTime) : undefined,
        tentative: booking.Tentative === true ? true : undefined,
        invoiced: booking.Invoiced === true ? true : undefined,
        notes: (booking.Notes as string) || undefined,
        cancellation_fee: feeValue,
      }),
    ),
    renderHelp([
      `Run \`nexudus-axi bookings cancel ${idRaw}\` to cancel this booking`,
    ]),
  );
}
