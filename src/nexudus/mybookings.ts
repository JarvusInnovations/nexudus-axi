import type { ActiveSpace } from "../config.js";
import { nexudusRequest } from "./client.js";

/**
 * My-bookings reads per specs/api/bookings.md § Reading my bookings.
 * fullCalendarBookings carries EVERY member's bookings (others anonymized);
 * these helpers filter to the caller's cached coworker id and normalize the
 * fake-Z wall-clock strings.
 */

export interface CalendarBookingRow {
  id: number;
  resourceId?: number;
  resourceName?: string;
  resourceTypeName?: string;
  /** Space wall-clock with a literal Z (rows carry ignoreTimezone: true). */
  start: string;
  end: string;
  allDay?: boolean;
  coworkerId?: number;
  tentative?: boolean;
  invoiced?: boolean;
  editable?: boolean;
  private?: boolean;
  title?: string;
}

export interface UnpaidCounts {
  BookingsToPay?: number;
  TimeToPay?: number;
}

/** `2026-07-31T09:00Z` → `{date, time}` wall-clock parts. */
export function splitWallclock(value: string): { date: string; time: string } {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? { date: m[1]!, time: m[2]! } : { date: value, time: "" };
}

/** Fetch the caller's own bookings between two wall-clock dates (inclusive). */
export async function fetchMyBookings(
  active: ActiveSpace,
  fromDate: string,
  toDate: string,
): Promise<CalendarBookingRow[]> {
  const coworkerId = active.stored?.profile_cache?.coworker_id;
  const rows = await nexudusRequest<CalendarBookingRow[]>(active, "/en/bookings/fullCalendarBookings", {
    query: { start: fromDate, end: toDate },
  });
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => coworkerId !== undefined && r.coworkerId === coworkerId)
    // The server honors the window loosely — enforce it client-side.
    .filter((r) => {
      const day = splitWallclock(r.start).date;
      return day >= fromDate && day <= toDate;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function fetchUnpaidCounts(active: ActiveSpace): Promise<UnpaidCounts> {
  return nexudusRequest<UnpaidCounts>(active, "/en/bookings/getUnpaidBookings");
}

export function bookingStatus(row: CalendarBookingRow): string {
  if (row.tentative) return "tentative";
  return "confirmed";
}
