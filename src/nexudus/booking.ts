import { randomUUID } from "node:crypto";
import { AxiError } from "axi-sdk-js";
import type { ActiveSpace } from "../config.js";
import { nexudusRequest } from "./client.js";

/**
 * Booking writes per specs/api/bookings.md: the Booking object, the
 * PreviewInvoice cost source (getbookingprice returns an empty 200 — useless),
 * and the create/cancel endpoints.
 */

export interface BookingPayload {
  Id: number;
  ResourceId: number;
  FromTime: string;
  ToTime: string;
  CoworkerId: number;
  ChargeNow: boolean;
  BookingVisitors: unknown[];
  BookingProducts: unknown[];
  CustomFields: { Data: unknown[] };
  UniqueId: string;
}

export function buildBooking(options: {
  resourceId: number;
  fromApi: string;
  toApi: string;
  coworkerId: number;
}): BookingPayload {
  return {
    Id: 0,
    ResourceId: options.resourceId,
    FromTime: options.fromApi,
    ToTime: options.toApi,
    CoworkerId: options.coworkerId,
    ChargeNow: true,
    BookingVisitors: [],
    BookingProducts: [],
    CustomFields: { Data: [] },
    UniqueId: randomUUID(),
  };
}

const PREVIEW_SHAPE =
  "Id,Currency,UsedExtraServices,UsedBookingCredits,TotalAmount,TaxAmount,CoworkerProductName,LinesRaw.DiscountCode,LinesRaw.DiscountAmount,LinesRaw.BookingUniqueId,LinesRaw.UnitPrice,LinesRaw.SubTotal,LinesRaw.TotalAmount,LinesRaw.TaxAmount,LinesRaw.Description,LinesRaw.CoworkerProductName,Errors,Message,WasSuccessful,Status";

export interface PreviewResult {
  TotalAmount?: number;
  TaxAmount?: number;
  Currency?: { Code?: string };
  UsedBookingCredits?: Array<{ Amount?: number; UnitCreditPrice?: number; ExpiresOn?: string }>;
  LinesRaw?: Array<{ UnitPrice?: number; SubTotal?: number; Description?: string }>;
  WasSuccessful?: boolean;
  Message?: string | null;
  Errors?: unknown;
}

/**
 * Price a booking without committing anything. The basket service throws a
 * transient "Could not load your basket" occasionally (observed live) — that
 * one message gets a single retry before failing.
 */
export async function previewInvoice(active: ActiveSpace, booking: BookingPayload): Promise<PreviewResult> {
  const attempt = () =>
    nexudusRequest<PreviewResult & { Status?: number }>(active, "/en/basket/PreviewInvoice", {
      method: "POST",
      query: { createZeroValueInvoice: true, _shape: PREVIEW_SHAPE },
      body: [{ Type: "booking", Booking: booking }],
    });

  let result = await attempt();
  if (/could not load your basket/i.test(result.Message ?? "")) {
    result = await attempt();
  }
  if (result.WasSuccessful === false || (typeof result.Status === "number" && result.Status >= 400)) {
    throw new AxiError(
      `The space rejected the booking preview${result.Message ? `: ${result.Message}` : ""}`,
      "UNAVAILABLE",
      ["Run `nexudus-axi rooms slots <room> --date <date>` to find an open window"],
    );
  }
  return result;
}

/** Credits consumed per the preview (sum of UsedBookingCredits amounts). */
export function creditsUsed(preview: PreviewResult): number {
  return (preview.UsedBookingCredits ?? []).reduce((sum, c) => sum + (c.Amount ?? 0), 0);
}

/**
 * Portal action envelope: business-rule failures arrive as HTTP 200 with
 * `{Status: 500, Message, Errors[]}` (specs/api/bookings.md § Write
 * endpoints). An empty body is success.
 */
interface ActionEnvelope {
  Status?: number;
  Message?: string | null;
  Errors?: Array<{ Message?: string }>;
}

function throwOnEnvelopeError(result: ActionEnvelope, operation: string, suggestions: string[]): void {
  if (typeof result.Status === "number" && result.Status >= 400) {
    const conflict = /already booked/i.test(result.Message ?? "");
    throw new AxiError(
      `${operation}${result.Message ? `: ${result.Message}` : " was refused by the space"}`,
      conflict ? "UNAVAILABLE" : "REFUSED",
      suggestions,
    );
  }
}

/**
 * Commit a new booking — the member path is the basket's CreateInvoice
 * (newBookingJson is Access-Denied for members; PostItems double-books).
 * Success is an empty 200; the booking id is recovered by the caller from
 * the calendar feed.
 */
export async function createBooking(active: ActiveSpace, booking: BookingPayload): Promise<void> {
  const result = await nexudusRequest<ActionEnvelope>(active, "/en/basket/CreateInvoice", {
    method: "POST",
    query: { createZeroValueInvoice: true },
    body: [{ Type: "booking", Booking: booking }],
  });
  throwOnEnvelopeError(result, "Booking failed", [
    "Run `nexudus-axi rooms slots <room> --date <date>` to re-check availability",
  ]);
}

export interface CancellationFee {
  fee: number;
  has: boolean;
}

/**
 * The cancellation fee the space would charge right now for this booking.
 * Verified shape: `{hasCancellationFee: boolean, cancellationFee: number|null}`.
 */
export async function fetchCancellationFee(active: ActiveSpace, bookingId: number): Promise<CancellationFee> {
  const raw = await nexudusRequest<{ hasCancellationFee?: boolean; cancellationFee?: number | null }>(
    active,
    "/en/bookings/getCancellationFee",
    { query: { bookingId } },
  );
  const has = raw.hasCancellationFee === true;
  return { fee: has && typeof raw.cancellationFee === "number" ? raw.cancellationFee : 0, has };
}

/** Cancel a booking — `{Status: 200}` envelope on success (verified live). */
export async function cancelBooking(active: ActiveSpace, bookingId: number): Promise<void> {
  const result = await nexudusRequest<ActionEnvelope>(active, `/en/bookings/deletejson/${bookingId}`, {
    method: "POST",
    body: {},
  });
  throwOnEnvelopeError(result, "Cancellation failed", [
    `Run \`nexudus-axi bookings view ${bookingId}\` for the booking's current state`,
  ]);
}
