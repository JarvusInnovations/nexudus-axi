import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchMyBookings, splitWallclock, bookingStatus } from "../src/nexudus/mybookings.js";
import { baseUrlForSpace, writeStoredSpace, type ActiveSpace, type StoredSpace } from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

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
      coworker_name: "Member Example",
      email: "member@example.com",
      business_id: 1,
      business_name: "Acme Coworking",
      timezone: "America/New_York",
      cached_at: new Date().toISOString(),
    },
  };
}

function active(): ActiveSpace {
  const s = stored();
  return { space: s.space, baseUrl: s.base_url, token: s.access_token, stored: s, source: "single" };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexudus-axi-test-"));
  process.env.NEXUDUS_AXI_CONFIG_DIR = dir;
  writeStoredSpace(stored());
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
});

describe("splitWallclock", () => {
  it("splits fake-Z calendar times without parsing them as instants", () => {
    expect(splitWallclock("2026-07-31T09:00Z")).toEqual({ date: "2026-07-31", time: "09:00" });
    expect(splitWallclock("2026-09-02T14:30:00.000Z")).toEqual({ date: "2026-09-02", time: "14:30" });
  });
});

describe("fetchMyBookings", () => {
  const rows = [
    // mine, in window
    { id: 1, resourceName: "Room A", start: "2026-09-02T14:00Z", end: "2026-09-02T15:00Z", coworkerId: MY_ID },
    // someone else's (anonymized) — must be filtered out
    { id: 2, resourceName: "Room A", start: "2026-09-02T15:00Z", end: "2026-09-02T16:00Z", coworkerId: 999, private: true },
    // mine, but outside the requested window (server honors it loosely)
    { id: 3, resourceName: "Room B", start: "2026-08-15T10:00Z", end: "2026-08-15T11:00Z", coworkerId: MY_ID },
    // mine, later — proves sorting
    { id: 4, resourceName: "Room B", start: "2026-09-02T09:00Z", end: "2026-09-02T09:30Z", coworkerId: MY_ID },
  ];

  it("passes required start/end params, filters to my rows in-window, sorts by start", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const mine = await fetchMyBookings(active(), "2026-09-01", "2026-09-08");
    expect(String(spy.mock.calls[0]![0])).toContain("start=2026-09-01");
    expect(String(spy.mock.calls[0]![0])).toContain("end=2026-09-08");
    expect(mine.map((r) => r.id)).toEqual([4, 1]);
  });
});

describe("bookingStatus", () => {
  it("maps tentative flag", () => {
    expect(bookingStatus({ id: 1, start: "", end: "", tentative: true })).toBe("tentative");
    expect(bookingStatus({ id: 1, start: "", end: "" })).toBe("confirmed");
  });
});
