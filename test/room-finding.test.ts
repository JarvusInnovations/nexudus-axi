import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authCommand } from "../src/commands/auth.js";
import {
  baseUrlForSpace,
  prefsPath,
  readPrefs,
  writePrefs,
  writeStoredSpace,
  type StoredSpace,
} from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

function stored(slug = "acme"): StoredSpace {
  return {
    space: slug,
    base_url: baseUrlForSpace(slug),
    email: "member@example.com",
    access_token: "at",
    refresh_token: "rt",
    token_obtained_at: new Date().toISOString(),
  };
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

describe("prefs lifecycle", () => {
  it("round-trips favorites and survives logout (credentials/preferences split)", async () => {
    writeStoredSpace(stored());
    writePrefs("acme", { favorite_rooms: [11, 12] });
    expect(readPrefs("acme").favorite_rooms).toEqual([11, 12]);

    const out = await authCommand(["logout"]);
    expect(out).toContain("logged out of acme");
    // Tokens gone, prefs intact.
    expect(existsSync(prefsPath("acme"))).toBe(true);
    expect(readPrefs("acme").favorite_rooms).toEqual([11, 12]);
  });

  it("falls back to empty on an unparseable prefs file", () => {
    writePrefs("acme", { favorite_rooms: [1] });
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(prefsPath("acme"), "{corrupt");
    expect(readPrefs("acme")).toEqual({});
  });
});

describe("rooms free / day / favorites (routed fetch)", () => {
  const ROOMS = {
    Resources: [
      { Id: 11, UniqueId: "aaaa", Name: "Call Room A", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 1 },
      { Id: 12, UniqueId: "bbbb", Name: "Call Room B", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 2 },
      { Id: 13, UniqueId: "cccc", Name: "Boardroom", ResourceTypeName: "Boardroom", Allocation: 10, Visible: true, DisplayOrder: 3 },
    ],
  };

  /** A slot grid for 2026-09-02: free except 16:00–17:00 for the given guid set. */
  function grid(bookedGuids: Set<string>, guid: string) {
    const slots = [];
    for (let h = 0; h < 24; h++) {
      for (const min of [0, 30]) {
        const t = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        const inBooked = bookedGuids.has(guid) && h === 16;
        slots.push({ DateTime: `2026-09-02T${t}`, Available: !inBooked });
      }
    }
    return { AvailableSlots: slots };
  }

  function route(bookedGuids: Set<string>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("publicresources")
        ? ROOMS
        : url.includes("GetAvailabilityAtWithUser")
          ? grid(bookedGuids, new URL(url).searchParams.get("guid") ?? "")
          : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  }

  async function roomsCmd(args: string[]): Promise<string> {
    const { roomsCommand } = await import("../src/commands/rooms.js");
    return roomsCommand(args);
  }

  beforeEach(() => {
    writeStoredSpace({
      ...stored(),
      profile_cache: {
        coworker_id: 1,
        coworker_name: "Member",
        email: "member@example.com",
        business_id: 1,
        business_name: "Acme",
        timezone: "America/New_York",
        cached_at: new Date().toISOString(),
      },
    });
  });

  it("free: reports free vs busy with the conflict range; lens defaults to favorites", async () => {
    writePrefs("acme", { favorite_rooms: [11, 12] });
    route(new Set(["bbbb"]));
    const out = await roomsCmd(["free", "--from", "4pm", "--date", "2026-09-02"]);
    expect(out).toContain("lens: favorites");
    expect(out).toContain("Call Room A");
    expect(out).toContain("16:00–17:00"); // B's conflict
    expect(out).not.toContain("Boardroom"); // outside the lens
  });

  it("free: --all widens past the lens", async () => {
    writePrefs("acme", { favorite_rooms: [11] });
    route(new Set());
    const out = await roomsCmd(["free", "--from", "4pm", "--date", "2026-09-02", "--all"]);
    expect(out).toContain("lens: all");
    expect(out).toContain("Boardroom");
  });

  it("day: clips to the hours window with all-day/booked-out sentinels", async () => {
    route(new Set(["bbbb"]));
    const out = await roomsCmd(["day", "--date", "2026-09-02", "--hours", "8-20"]);
    expect(out).toContain("all day"); // A and Boardroom
    expect(out).toContain("08:00–16:00, 17:00–20:00"); // B around its booking
  });

  it("favorites: add resolves names, re-add is a no-op, list and clear work", async () => {
    route(new Set());
    expect(await roomsCmd(["favorites", "add", "call room a"])).toContain("added: Call Room A");
    expect(await roomsCmd(["favorites", "add", "11"])).toContain("no-op");
    expect(await roomsCmd(["favorites"])).toContain("Call Room A");
    expect(await roomsCmd(["favorites", "clear"])).toContain("cleared 1 favorite");
    expect(readPrefs("acme").favorite_rooms).toEqual([]);
  });
});
