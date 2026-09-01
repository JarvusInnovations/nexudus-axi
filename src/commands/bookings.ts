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
import { cancelBooking, fetchCancellationFee } from "../nexudus/booking.js";
import { activeSpaceFrom } from "./auth.js";

/** `bookings [list|view|cancel]` — see `specs/commands/bookings.md`. */

export async function bookingsCommand(args: string[]): Promise<string> {
  const { sub, parsed } = parseSubcommand("bookings", args, BOOKINGS_FLAGS, "list");
  switch (sub) {
    case "list":
      return bookingsList(parsed);
    case "view":
      return bookingsView(parsed);
    case "cancel":
      return bookingsCancel(parsed);
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
 * Booking detail per the verified BookingJson shape:
 * `{Value: {...booking fields...}, Resource: {Id, Name}}` — Value times are
 * wall-clock without any zone suffix (specs/api/bookings.md).
 */
interface BookingJsonResponse {
  Value?: {
    Id?: number;
    ResourceName?: string;
    FromTime?: string;
    ToTime?: string;
    Tentative?: boolean;
    Invoiced?: boolean;
    Notes?: string | null;
  };
  Resource?: { Id?: number; Name?: string };
}

async function bookingsView(parsed: Parsed): Promise<string> {
  const idRaw = requirePositional(parsed, 0, "booking id", "nexudus-axi bookings view <id>");
  if (!/^\d+$/.test(idRaw)) {
    throw new AxiError(`"${idRaw}" is not a booking id`, "VALIDATION_ERROR", [
      "Run `nexudus-axi bookings` to list your bookings and their ids",
    ]);
  }
  const active = activeSpaceFrom(parsed);

  const booking = await nexudusRequest<BookingJsonResponse>(active, `/en/bookings/BookingJson/${idRaw}`);
  const value = booking.Value;
  if (!value?.Id) {
    throw new AxiError(`No booking ${idRaw} is visible to your account`, "NOT_FOUND", [
      "Run `nexudus-axi bookings` to list your bookings and their ids",
    ]);
  }

  const { fee, has } = await fetchCancellationFee(active, Number(idRaw)).catch(() => ({ fee: 0, has: false }));

  return joinBlocks(
    renderObject(
      compact({
        space: active.space,
        id: value.Id,
        room: value.ResourceName ?? booking.Resource?.Name ?? undefined,
        from: value.FromTime ? renderWallclock(value.FromTime) : undefined,
        to: value.ToTime ? renderWallclock(value.ToTime) : undefined,
        tentative: value.Tentative === true ? true : undefined,
        invoiced: value.Invoiced === true ? true : undefined,
        notes: value.Notes || undefined,
        cancellation_fee: has ? fee : 0,
      }),
    ),
    renderHelp([
      `Run \`nexudus-axi bookings cancel ${idRaw}\` to cancel this booking`,
    ]),
  );
}

/**
 * `bookings cancel <id>` — fee-aware, idempotent cancellation
 * (specs/commands/bookings.md). The fee is fetched first so the output can
 * state what the cancellation cost, and an already-cancelled/unknown booking
 * resolves per AXI idempotency rules.
 */
async function bookingsCancel(parsed: Parsed): Promise<string> {
  const idRaw = requirePositional(parsed, 0, "booking id", "nexudus-axi bookings cancel <id>");
  if (!/^\d+$/.test(idRaw)) {
    throw new AxiError(`"${idRaw}" is not a booking id`, "VALIDATION_ERROR", [
      "Run `nexudus-axi bookings` to list your bookings and their ids",
    ]);
  }
  const id = Number(idRaw);
  // Cancellation is a mutation — explicit space with 2+ stored.
  const active = activeSpaceFrom(parsed, { mutation: true });

  // Fetch the row first so cancel-of-cancelled can no-op and output can name
  // the booking. The calendar feed is the reliable existence check.
  const zone = active.stored?.profile_cache?.timezone;
  const today = todayInZone(zone);
  const mine = await fetchMyBookings(
    active,
    formatWallDate(addDays(today, -30)),
    formatWallDate(addDays(today, 90)),
  );
  const row = mine.find((r) => r.id === id);
  if (!row) {
    // Unknown to my calendar: already cancelled (no-op) or never mine.
    return renderObject({
      status: `booking ${id} is not on your calendar — already cancelled, past the fetch window, or not yours (no-op)`,
    });
  }

  const { fee } = await fetchCancellationFee(active, id).catch(() => ({ fee: 0 }));

  await cancelBooking(active, id); // envelope failures throw inside

  return joinBlocks(
    renderObject(
      compact({
        cancelled: row.resourceName ?? `booking ${id}`,
        id,
        space: active.space,
        window: `${splitWallclock(row.start).date} ${splitWallclock(row.start).time}–${splitWallclock(row.end).time}`,
        fee: fee > 0 ? fee.toFixed(2) : "0.00",
      }),
    ),
    renderHelp(["Run `nexudus-axi bookings` to confirm; credits used by the booking are restored by the space's policy"]),
  );
}
