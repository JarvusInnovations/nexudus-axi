import type { ActiveSpace } from "../config.js";
import { nexudusRequest } from "./client.js";

/**
 * Per-slot availability (specs/api/resources.md § Per-slot availability) and
 * the range compression `rooms slots` renders (specs/commands/rooms.md):
 * agents want "14:00–17:30 is open", not 48 slot rows.
 */

export interface AvailabilitySlot {
  /** Space wall-clock, no zone suffix: `2026-09-01T14:00`. */
  DateTime: string;
  Time?: string;
  /** Bookable IN PRINCIPLE (inside shifts, permitted) — NOT "unbooked". */
  Available: boolean;
  Capacity?: number;
  BookedCount?: number;
  Booked?: boolean;
  AllowMultipleBookings?: boolean;
}

/**
 * The single occupancy rule (specs/api/resources.md § Per-slot availability).
 *
 * `Available` is a bookable-hours flag, not an occupancy signal: a fully
 * booked slot still reports `Available: true` alongside
 * `{Capacity: 1, BookedCount: 1, Booked: true}`. Reading `Available` alone
 * reports booked rooms as free — the bug this predicate exists to prevent.
 */
export function isSlotFree(slot: AvailabilitySlot): boolean {
  if (slot.Available === false) return false;
  const capacity = typeof slot.Capacity === "number" && slot.Capacity > 0 ? slot.Capacity : 1;
  const bookedCount =
    typeof slot.BookedCount === "number" ? slot.BookedCount : slot.Booked === true ? capacity : 0;
  return bookedCount < capacity;
}

interface AvailabilityResponse {
  Resource?: { Id?: number; Name?: string };
  AvailableSlots?: AvailabilitySlot[];
}

export async function fetchAvailability(
  active: ActiveSpace,
  guid: string,
  startDate: string,
  days: number,
  intervalMinutes: number,
): Promise<AvailabilitySlot[]> {
  const res = await nexudusRequest<AvailabilityResponse>(active, "/en/bookings/GetAvailabilityAtWithUser", {
    query: { days, guid, startTime: startDate, interval: intervalMinutes },
  });
  return res.AvailableSlots ?? [];
}

export interface SlotRange {
  from: string;
  to: string;
}

/** `2026-09-01T14:00` + n minutes → same wall-clock string form. */
function addMinutesWallclock(dateTime: string, minutes: number): string {
  const m = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return dateTime;
  // UTC-pinned Date as a pure component-math vehicle (see time/wallclock.ts).
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]! + minutes));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Compress the slot grid into contiguous half-open ranges. Each slot covers
 * [DateTime, DateTime + interval); consecutive slots with the same freeness
 * (per `isSlotFree`, NOT the raw `Available` flag) merge. Gaps in the grid
 * close the running range.
 */
export function compressSlots(
  slots: AvailabilitySlot[],
  intervalMinutes: number,
): { free: SlotRange[]; booked: SlotRange[] } {
  const free: SlotRange[] = [];
  const booked: SlotRange[] = [];

  let current: { free: boolean; from: string; to: string } | null = null;

  const flush = () => {
    if (!current) return;
    (current.free ? free : booked).push({ from: current.from, to: current.to });
    current = null;
  };

  for (const slot of slots) {
    const end = addMinutesWallclock(slot.DateTime, intervalMinutes);
    const slotFree = isSlotFree(slot);
    if (current && current.free === slotFree && current.to === slot.DateTime) {
      current.to = end;
    } else {
      flush();
      current = { free: slotFree, from: slot.DateTime, to: end };
    }
  }
  flush();

  return { free, booked };
}
