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

  /**
   * A slot grid for 2026-09-02 honoring the requested interval: free except
   * 16:00–17:00 for the given guid set.
   */
  function grid(bookedGuids: Set<string>, guid: string, intervalMin: number) {
    const slots = [];
    for (let m = 0; m < 24 * 60; m += intervalMin) {
      const h = Math.floor(m / 60);
      const t = `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const inBooked = bookedGuids.has(guid) && h === 16;
      slots.push({ DateTime: `2026-09-02T${t}`, Available: !inBooked });
    }
    return { AvailableSlots: slots };
  }

  function route(bookedGuids: Set<string>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("publicresources")
        ? ROOMS
        : url.includes("GetAvailabilityAtWithUser")
          ? grid(
              bookedGuids,
              new URL(url).searchParams.get("guid") ?? "",
              Number(new URL(url).searchParams.get("interval") ?? "30"),
            )
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

describe("setup hooks --scope", () => {
  it("project scope writes into the cwd's config, leaving the user scope alone", async () => {
    const { setupCommand } = await import("../src/commands/setup.js");
    const { mkdtempSync: mkTmp, existsSync: exists, rmSync: rm } = await import("node:fs");
    const { join: j } = await import("node:path");
    const { tmpdir: tmp } = await import("node:os");

    const projectDir = mkTmp(j(tmp(), "nexudus-axi-proj-"));
    const prevCwd = process.cwd();
    process.chdir(projectDir);
    // cwd resolves the macOS /var → /private/var symlink; compare against it.
    const realRoot = process.cwd();
    try {
      const out = await setupCommand(["hooks", "--scope", "project"]);
      expect(out).toContain("scope: project");
      expect(out).toContain(`root: ${realRoot}`);
      const status = await setupCommand(["hooks", "status", "--scope", "project"]);
      expect(status).toContain(`root: ${realRoot}`);
      expect(status).not.toContain(`root: ${process.env.HOME ?? "/nonexistent"}`);
      void j; // path helper retained for symmetry with the other suites
    } finally {
      process.chdir(prevCwd);
      rm(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown scope with the two valid values", async () => {
    const { setupCommand } = await import("../src/commands/setup.js");
    await expect(setupCommand(["hooks", "--scope", "global"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("favorites order is preference ranking", () => {
  const ROOMS_RANKED = {
    Resources: [
      { Id: 21, UniqueId: "r21", Name: "Room Alpha", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 1 },
      { Id: 22, UniqueId: "r22", Name: "Room Beta", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 2 },
      { Id: 23, UniqueId: "r23", Name: "Room Gamma", ResourceTypeName: "Boardroom", Allocation: 8, Visible: true, DisplayOrder: 3 },
    ],
  };

  function routeRanked() {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      let body: unknown = {};
      if (url.includes("publicresources")) body = ROOMS_RANKED;
      else if (url.includes("GetAvailabilityAtWithUser")) {
        const interval = Number(new URL(url).searchParams.get("interval") ?? "30");
        const slots = [];
        for (let m = 0; m < 24 * 60; m += interval) {
          const h = Math.floor(m / 60);
          slots.push({
            DateTime: `2026-09-02T${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
            Available: true,
          });
        }
        body = { AvailableSlots: slots };
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  }

  beforeEach(() => {
    writeStoredSpace({
      ...stored(),
      profile_cache: {
        coworker_id: 1, coworker_name: "Member", email: "member@example.com",
        business_id: 1, business_name: "Acme", timezone: "America/New_York",
        cached_at: new Date().toISOString(),
      },
    });
    // Rank Beta ABOVE Alpha despite Alpha's lower DisplayOrder.
    writePrefs("acme", { favorite_rooms: [22, 21] });
  });

  async function roomsCmd(args: string[]): Promise<string> {
    const { roomsCommand } = await import("../src/commands/rooms.js");
    return roomsCommand(args);
  }

  it("free lists the top-ranked room first and books it in the suggestion", async () => {
    routeRanked();
    const out = await roomsCmd(["free", "--from", "4pm", "--date", "2026-09-02"]);
    expect(out.indexOf("Room Beta")).toBeLessThan(out.indexOf("Room Alpha"));
    expect(out).toContain("book --room 22");
  });

  it("day rows follow rank under the lens; --all restores DisplayOrder", async () => {
    routeRanked();
    const lensed = await roomsCmd(["day", "--date", "2026-09-02"]);
    expect(lensed.indexOf("Room Beta")).toBeLessThan(lensed.indexOf("Room Alpha"));
    const all = await roomsCmd(["day", "--date", "2026-09-02", "--all"]);
    expect(all.indexOf("Room Alpha")).toBeLessThan(all.indexOf("Room Beta"));
  });

  it("catalog sorts favorites by rank with the rank in the fav column", async () => {
    routeRanked();
    const out = await roomsCmd(["list"]);
    expect(out.indexOf("Room Beta")).toBeLessThan(out.indexOf("Room Alpha"));
    expect(out).toMatch(/Room Beta[^\n]*,1\n/);
    expect(out).toMatch(/Room Alpha[^\n]*,2\n/);
  });

  it("favorites shows the rank column and re-add keeps rank", async () => {
    routeRanked();
    expect(await roomsCmd(["favorites", "add", "22"])).toContain("no-op");
    const out = await roomsCmd(["favorites"]);
    expect(out).toContain("rank");
    expect(out.indexOf("Room Beta")).toBeLessThan(out.indexOf("Room Alpha"));
  });
});
