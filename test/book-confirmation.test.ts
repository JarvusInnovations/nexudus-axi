import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseUrlForSpace, writeStoredSpace, type StoredSpace } from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

const ROOM_ID = 31;
const MY_ID = 100000002;

function stored(): StoredSpace {
  return {
    space: "acme",
    base_url: baseUrlForSpace("acme"),
    email: "member@example.com",
    access_token: "at",
    refresh_token: "rt",
    token_obtained_at: new Date().toISOString(),
    profile_cache: {
      coworker_id: MY_ID,
      coworker_name: "Member",
      email: "member@example.com",
      business_id: 1,
      business_name: "Acme",
      timezone: "America/New_York",
      cached_at: new Date().toISOString(),
    },
  };
}

const RESOURCES = {
  Resources: [
    {
      Id: ROOM_ID,
      UniqueId: "guid-31",
      Name: "Call Room",
      ResourceTypeName: "Phone Rooms",
      Allocation: 2,
      Visible: true,
      DisplayOrder: 1,
    },
  ],
};

/** Free 15-minute grid for the booking date. */
function freeGrid(day: string) {
  const slots = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    slots.push({ DateTime: `${day}T${h}:${String(m % 60).padStart(2, "0")}`, Available: true });
  }
  return { AvailableSlots: slots };
}

/**
 * Route the whole book flow. `afterRows` is what the calendar feed returns
 * once the commit has happened (the "before" snapshot is always empty).
 */
function routeBooking(afterRows: Array<Record<string, unknown>>) {
  let committed = false;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("publicresources")) body = RESOURCES;
    else if (url.includes("GetAvailabilityAtWithUser")) body = freeGrid("2026-09-05");
    else if (url.includes("PreviewInvoice")) {
      body = { TotalAmount: 0, Currency: { Code: "USD" }, UsedBookingCredits: [{ Amount: 0.5 }], WasSuccessful: true };
    } else if (url.includes("CreateInvoice")) {
      committed = true;
      return new Response("", { status: 200 });
    } else if (url.includes("fullCalendarBookings")) {
      body = committed ? afterRows : [];
    }
    void init;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

async function book(args: string[]): Promise<string> {
  const { bookCommand } = await import("../src/commands/book.js");
  return bookCommand(args);
}

const ARGS = ["--room", "Call Room", "--date", "2026-09-05", "--from", "15:00", "--to", "+30m"];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexudus-axi-test-"));
  process.env.NEXUDUS_AXI_CONFIG_DIR = dir;
  writeStoredSpace(stored());
  process.exitCode = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
  process.exitCode = 0;
});

describe("book reports the server's confirmed time", () => {
  it("happy path: renders the stored window, confirmed: true, exit 0", async () => {
    routeBooking([
      { id: 900, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T15:00Z", end: "2026-09-05T15:30Z", coworkerId: String(MY_ID) },
    ]);
    const out = await book(ARGS);
    expect(out).toContain("id: 900");
    expect(out).toContain("window: \"15:00–15:30\"");
    expect(out).toContain("confirmed: true");
    expect(process.exitCode).toBe(0);
  });

  it("shifted: warns with both windows, keeps the id, exits 1", async () => {
    // The offset-trap signature: 15:00 requested, 19:00 stored.
    routeBooking([
      { id: 901, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T19:00Z", end: "2026-09-05T19:30Z", coworkerId: String(MY_ID) },
    ]);
    const out = await book(ARGS);
    expect(out).toMatch(/^warning:/);
    expect(out).toContain("requested 2026-09-05 15:00–15:30");
    expect(out).toContain("confirmed 2026-09-05 19:00–19:30");
    expect(out).toContain("id: 901");
    expect(out).toContain("cancel 901");
    expect(process.exitCode).toBe(1);
  });

  it("finds a booking shifted onto the next day (id-diff, not window match)", async () => {
    routeBooking([
      { id: 902, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-06T01:00Z", end: "2026-09-06T01:30Z", coworkerId: String(MY_ID) },
    ]);
    const out = await book(ARGS);
    expect(out).toContain("id: 902");
    expect(out).toContain("confirmed 2026-09-06 01:00–01:30");
    expect(process.exitCode).toBe(1);
  });

  it("pre-existing rows are ignored — only the new id counts", async () => {
    let committed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      let body: unknown = {};
      const existing = { id: 800, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T09:00Z", end: "2026-09-05T09:30Z", coworkerId: String(MY_ID) };
      const fresh = { id: 903, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T15:00Z", end: "2026-09-05T15:30Z", coworkerId: String(MY_ID) };
      if (url.includes("publicresources")) body = RESOURCES;
      else if (url.includes("GetAvailabilityAtWithUser")) body = freeGrid("2026-09-05");
      else if (url.includes("PreviewInvoice")) body = { TotalAmount: 0, Currency: { Code: "USD" }, UsedBookingCredits: [{ Amount: 0.5 }], WasSuccessful: true };
      else if (url.includes("CreateInvoice")) { committed = true; return new Response("", { status: 200 }); }
      else if (url.includes("fullCalendarBookings")) body = committed ? [existing, fresh] : [existing];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const out = await book(ARGS);
    expect(out).toContain("id: 903");
    expect(out).toContain("confirmed: true");
    expect(process.exitCode).toBe(0);
  });

  it("unconfirmed: no new row → confirmed: false, no fabricated window, exit 1", async () => {
    routeBooking([]);
    const out = await book(ARGS);
    expect(out).toContain("confirmed: false");
    expect(out).toContain("requested: \"15:00–15:30\"");
    expect(out).not.toContain("window:");
    expect(process.exitCode).toBe(1);
  });

  it("--dry-run is unaffected and commits nothing", async () => {
    const spy = routeBooking([]);
    const out = await book([...ARGS, "--dry-run"]);
    expect(out).toContain("would_book");
    expect(process.exitCode).toBe(0);
    expect(spy.mock.calls.some((c) => String(c[0]).includes("CreateInvoice"))).toBe(false);
  });
});
