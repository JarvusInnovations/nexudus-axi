import { AxiError } from "axi-sdk-js";
import { BOOK_FLAGS, bool, parseFlags, str } from "../flags.js";
import {
  buildBooking,
  createBooking,
  creditsUsed,
  previewInvoice,
} from "../nexudus/booking.js";
import { fetchMyBookings, splitWallclock } from "../nexudus/mybookings.js";
import { fetchResources, resolveRoom } from "../nexudus/resolve.js";
import { compressSlots, fetchAvailability } from "../nexudus/slots.js";
import { addDays, formatWallDate, renderTime, resolveWindow } from "../time/wallclock.js";
import { compact, joinBlocks, renderHelp, renderObject } from "../output/index.js";
import { activeSpaceFrom } from "./auth.js";

/** `book` — preview → commit in one invocation; see `specs/commands/book.md`. */

const USAGE = "nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur> [--dry-run]";
const INTERVAL = 30;

export async function bookCommand(args: string[]): Promise<string> {
  const parsed = parseFlags("book", args, BOOK_FLAGS);

  const roomRef = str(parsed, "--room");
  const from = str(parsed, "--from");
  const to = str(parsed, "--to");
  const missing = [!roomRef && "--room", !from && "--from", !to && "--to"].filter(Boolean);
  if (missing.length > 0) {
    throw new AxiError(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`, "USAGE", [USAGE]);
  }

  // Booking is the outward-facing mutation — explicit space with 2+ stored.
  const active = activeSpaceFrom(parsed, { mutation: true });
  const zone = active.stored?.profile_cache?.timezone;
  const coworkerId = active.stored?.profile_cache?.coworker_id;
  if (!coworkerId) {
    throw new AxiError("No cached member identity for this space", "PROFILE_MISSING", [
      `Run \`nexudus-axi auth login --space ${active.space} ...\` to refresh the profile`,
    ]);
  }

  const window = resolveWindow({ date: str(parsed, "--date"), from: from!, to: to!, zone });
  const date = formatWallDate(window.date);
  const room = resolveRoom(await fetchResources(active), roomRef!);

  // 1. Availability pre-check — refuse with the conflicting range rather than
  //    letting the API fail opaquely (specs/commands/book.md failure modes).
  const slots = await fetchAvailability(active, room.UniqueId, date, 1, INTERVAL);
  const fromKey = window.fromApi.slice(0, 16);
  const toKey = window.toApi.slice(0, 16);
  const inWindow = slots.filter((s) => {
    const key = s.DateTime.slice(0, 16);
    return key >= fromKey && key < toKey;
  });
  const { booked } = compressSlots(slots, INTERVAL);
  const conflicts = booked.filter((b) => b.from < toKey && b.to > fromKey);
  if (conflicts.length > 0 || inWindow.length === 0) {
    throw new AxiError(
      conflicts.length > 0
        ? `${room.Name} is booked ${conflicts.map((b) => `${b.from.slice(11, 16)}–${b.to.slice(11, 16)}`).join(", ")} within that window`
        : `${room.Name} has no bookable slots in that window (outside its hours?)`,
      "UNAVAILABLE",
      [
        `Run \`nexudus-axi rooms slots ${room.Id} --date ${date}\` to see open times`,
        `Run \`nexudus-axi rooms free --date ${date} --from ${renderTime(window.from)} --to ${renderTime(window.to)}\` to find another room`,
      ],
    );
  }

  // 2. Price preview — the mandatory cost answer.
  const booking = buildBooking({
    resourceId: room.Id,
    fromApi: window.fromApi,
    toApi: window.toApi,
    coworkerId,
  });
  const preview = await previewInvoice(active, booking);
  const total = preview.TotalAmount ?? 0;
  const credits = creditsUsed(preview);
  const currency = preview.Currency?.Code ?? "USD";

  // v1 boundary: paid-beyond-credits bookings go through the portal's card
  // checkout, not this tool (specs/commands/book.md).
  if (total > 0) {
    throw new AxiError(
      `This booking costs ${total.toFixed(2)} ${currency} beyond your credits — v1 books credit-covered reservations only`,
      "PAYMENT_REQUIRED",
      [
        "Complete this booking in the member portal, where card checkout lives",
        "Run `nexudus-axi credits` to see your balances",
      ],
    );
  }

  const costFields = {
    total: `${total.toFixed(2)} ${currency}`,
    credits_used: credits,
  };

  // 3. Dry run stops here.
  if (bool(parsed, "--dry-run")) {
    return joinBlocks(
      renderObject(
        compact({
          would_book: room.Name,
          space: active.space,
          date,
          window: `${renderTime(window.from)}–${renderTime(window.to)}`,
          ...costFields,
          available: true,
        }),
      ),
      renderHelp([`Re-run without --dry-run to commit the booking`]),
    );
  }

  // 4. Commit, then CONFIRM from the server rather than echoing the request
  //    (specs/commands/book.md § Confirmed times). The created row is found
  //    by id set-difference across date ± 1 — never by matching the window,
  //    since a shifted booking must still be found, possibly on another day.
  const probeFrom = formatWallDate(addDays(window.date, -1));
  const probeTo = formatWallDate(addDays(window.date, 1));
  const before = await fetchMyBookings(active, probeFrom, probeTo).catch(() => []);
  const knownIds = new Set(before.map((r) => r.id));

  await createBooking(active, booking);

  const after = await fetchMyBookings(active, probeFrom, probeTo).catch(() => []);
  let created = after.filter((r) => !knownIds.has(r.id) && r.resourceId === room.Id);
  if (created.length > 1) {
    // Concurrent booking on the same resource — prefer the row whose start is
    // closest to the request rather than guessing silently. Wall-clock strings
    // compare as digits (YYYYMMDDHHmm), so a plain numeric delta orders them.
    const asNumber = (wallclock: string) => Number(wallclock.replace(/\D/g, "").slice(0, 12));
    const target = asNumber(fromKey);
    created = [...created].sort(
      (a, b) => Math.abs(asNumber(a.start) - target) - Math.abs(asNumber(b.start) - target),
    );
  }
  const row = created[0];

  const requestedWindow = `${renderTime(window.from)}–${renderTime(window.to)}`;

  // Could not identify the row: never present an unverified booking as confirmed.
  if (!row) {
    process.exitCode = 1;
    return joinBlocks(
      renderObject(
        compact({
          booked: room.Name,
          space: active.space,
          date,
          requested: requestedWindow,
          confirmed: false,
          ...costFields,
        }),
      ),
      renderHelp([
        "The booking was accepted but could not be read back — run `nexudus-axi bookings` to confirm it landed and get its id",
      ]),
    );
  }

  const confirmedFrom = splitWallclock(row.start);
  const confirmedTo = splitWallclock(row.end);
  const confirmedWindow = `${confirmedFrom.time}–${confirmedTo.time}`;
  const shifted = confirmedFrom.date !== date || confirmedWindow !== requestedWindow;

  if (shifted) {
    process.exitCode = 1;
    return joinBlocks(
      renderObject(
        compact({
          warning: `the space stored a different time than requested — requested ${date} ${requestedWindow}, confirmed ${confirmedFrom.date} ${confirmedWindow}`,
          booked: room.Name,
          id: row.id,
          space: active.space,
          date: confirmedFrom.date,
          confirmed_window: confirmedWindow,
          requested_window: requestedWindow,
          ...costFields,
        }),
      ),
      renderHelp([
        `Run \`nexudus-axi bookings cancel ${row.id}\` to undo the mis-timed booking`,
        "Re-book with an explicit --date/--from/--to, then re-check the confirmed window",
      ]),
    );
  }

  return joinBlocks(
    renderObject(
      compact({
        booked: room.Name,
        id: row.id,
        space: active.space,
        date: confirmedFrom.date,
        window: confirmedWindow,
        confirmed: true,
        ...costFields,
      }),
    ),
    renderHelp([
      "Run `nexudus-axi bookings` to see it in context",
      `Run \`nexudus-axi bookings cancel ${row.id}\` to undo`,
    ]),
  );
}
