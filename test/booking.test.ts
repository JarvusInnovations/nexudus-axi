import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import {
  buildBooking,
  cancelBooking,
  createBooking,
  creditsUsed,
  fetchCancellationFee,
  previewInvoice,
} from "../src/nexudus/booking.js";
import { baseUrlForSpace, type ActiveSpace, type StoredSpace } from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

function active(): ActiveSpace {
  const s: StoredSpace = {
    space: "acme",
    base_url: baseUrlForSpace("acme"),
    email: "member@example.com",
    access_token: "at",
    refresh_token: "rt",
    token_obtained_at: new Date().toISOString(),
  };
  return { space: "acme", baseUrl: s.base_url, token: "at", stored: s, source: "single" };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexudus-axi-test-"));
  process.env.NEXUDUS_AXI_CONFIG_DIR = dir;
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
});

const BOOKING = buildBooking({
  resourceId: 100000001,
  fromApi: "2026-09-02T22:00:00.000Z",
  toApi: "2026-09-02T22:30:00.000Z",
  coworkerId: 100000002,
});

describe("buildBooking", () => {
  it("fills the verified payload shape with a fresh GUID", () => {
    expect(BOOKING.Id).toBe(0);
    expect(BOOKING.ChargeNow).toBe(true);
    expect(BOOKING.UniqueId).toMatch(/^[0-9a-f-]{36}$/);
    expect(buildBooking({ resourceId: 1, fromApi: "x", toApi: "y", coworkerId: 2 }).UniqueId).not.toBe(
      BOOKING.UniqueId,
    );
  });
});

describe("previewInvoice", () => {
  it("returns totals and credits on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ TotalAmount: 0, UsedBookingCredits: [{ Amount: 0.5 }], WasSuccessful: true }),
    );
    const preview = await previewInvoice(active(), BOOKING);
    expect(preview.TotalAmount).toBe(0);
    expect(creditsUsed(preview)).toBe(0.5);
  });

  it("retries exactly once on the transient basket message", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ WasSuccessful: false, Message: "Could not load your basket." }))
      .mockResolvedValueOnce(jsonResponse({ TotalAmount: 0, WasSuccessful: true }));
    const preview = await previewInvoice(active(), BOOKING);
    expect(preview.TotalAmount).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("throws UNAVAILABLE on a rejected preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ WasSuccessful: false, Message: "No availability" }),
    );
    await expect(previewInvoice(active(), BOOKING)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});

describe("createBooking (basket CreateInvoice)", () => {
  it("posts the items array to CreateInvoice and accepts an empty 200", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    await createBooking(active(), BOOKING);
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("/en/basket/CreateInvoice");
    expect(url).toContain("createZeroValueInvoice=true");
    const body = JSON.parse(String(spy.mock.calls[0]![1]?.body)) as Array<{ Type: string }>;
    expect(body[0]!.Type).toBe("booking");
  });

  it("surfaces the Status-500-in-200 envelope as UNAVAILABLE on conflicts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ Status: 500, Message: "This resource is already booked. Please choose a different start and end times." }),
    );
    try {
      await createBooking(active(), BOOKING);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("UNAVAILABLE");
      expect((err as AxiError).message).toContain("already booked");
    }
  });
});

describe("cancelBooking / fetchCancellationFee", () => {
  it("cancels via deletejson and accepts the Status-200 envelope", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ Status: 200, Message: "" }));
    await cancelBooking(active(), 42);
    expect(String(spy.mock.calls[0]![0])).toContain("/en/bookings/deletejson/42");
  });

  it("throws REFUSED on an envelope failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ Status: 500, Message: "Too late to cancel" }));
    await expect(cancelBooking(active(), 42)).rejects.toMatchObject({ code: "REFUSED" });
  });

  it("parses the verified fee shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ hasCancellationFee: true, cancellationFee: 10 }),
    );
    expect(await fetchCancellationFee(active(), 42)).toEqual({ fee: 10, has: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ hasCancellationFee: false, cancellationFee: null }),
    );
    expect(await fetchCancellationFee(active(), 42)).toEqual({ fee: 0, has: false });
  });
});
