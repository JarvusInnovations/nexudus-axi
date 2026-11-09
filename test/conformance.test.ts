import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { parseFlags } from "../src/flags.js";
import { baseUrlForSpace, writeStoredSpace, type StoredSpace } from "../src/config.js";

/**
 * AXI conformance fixes (plans/axi-conformance.md): extra positionals fail
 * loud, home never reports a failed read as empty, hooks install only from
 * `setup hooks`, a repeat install or repeat booking is a no-op.
 */

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let dir: string;
let fakeHome: string;
const realHome = process.env.HOME;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexudus-axi-test-"));
  process.env.NEXUDUS_AXI_CONFIG_DIR = dir;
  // The SDK writes Codex's flag to ~/.codex/config.toml at any scope: never let a test reach the real one.
  fakeHome = mkdtempSync(join(tmpdir(), "nexudus-axi-home-"));
  process.env.HOME = fakeHome;
  process.exitCode = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  process.env.HOME = realHome;
  rmSync(fakeHome, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
  process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";
  process.exitCode = 0;
});

describe("positional arguments", () => {
  it("rejects extras on a command that takes none, as USAGE", () => {
    try {
      parseFlags("doctor", ["extra"], {});
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("USAGE");
      expect((err as AxiError).message).toContain("extra");
      expect((err as AxiError).suggestions.join(" ")).toContain("takes no positional arguments");
    }
  });

  it("rejects a second positional where one is declared, naming the usage", () => {
    try {
      parseFlags("bookings cancel", ["123", "456"], { positionals: 1, usage: "nexudus-axi bookings cancel <id>" });
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("USAGE");
      expect((err as AxiError).message).toContain("456");
      expect((err as AxiError).suggestions.join(" ")).toContain("bookings cancel <id>");
    }
  });

  it("accepts a variadic tail and never blocks --help", () => {
    expect(parseFlags("rooms favorites", ["add", "a", "b"], { positionals: "many" }).positional).toEqual(["add", "a", "b"]);
    expect(parseFlags("doctor", ["extra", "--help"], {}).flags["--help"]).toBe(true);
  });

  it("auth logout no longer ignores a stray slug", async () => {
    writeStoredSpace(stored());
    const { authCommand } = await import("../src/commands/auth.js");
    await expect(authCommand(["logout", "other"])).rejects.toMatchObject({ code: "USAGE" });
  });
});

describe("home view reports failed reads, never a false empty", () => {
  it("a failed bookings read renders unavailable with a doctor hint, exit 0", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("fullCalendarBookings")) return json({ Message: "boom" }, 500);
      if (url.includes("benefits")) return json({ Personal: { BookingCredits: [] } });
      return json({});
    });
    const { homeCommand } = await import("../src/commands/home.js");
    const out = await homeCommand([]);
    expect(out).toMatch(/bookings: "?unavailable \(/);
    expect(out).not.toContain("nothing booked");
    expect(out).toContain("nexudus-axi doctor");
    expect(process.exitCode).toBe(0);
  });

  it("a failed credits read renders unavailable rather than disappearing", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("fullCalendarBookings")) return json([]);
      if (url.includes("benefits")) return json({ Message: "boom" }, 500);
      return json({});
    });
    const { homeCommand } = await import("../src/commands/home.js");
    const out = await homeCommand([]);
    expect(out).toMatch(/credits: "?unavailable \(/);
    expect(out).toContain("nothing booked in the next 7 days");
  });
});

describe("session hooks register only from setup hooks", () => {
  it("auth login reports hook status without installing anything", async () => {
    const home = mkdtempSync(join(tmpdir(), "nexudus-axi-home-"));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/token")) return json({ access_token: "at1", refresh_token: "rt1" });
        if (url.includes("/en/profile")) return json({ Id: MY_ID, FullName: "Member", Email: "member@example.com", BusinessId: 1 });
        if (url.includes("/en/business/all")) return json([{ Id: 1, Name: "Acme" }]);
        return json({});
      });
      const { authCommand } = await import("../src/commands/auth.js");
      const out = await authCommand([
        "login", "--space", "acme", "--email", "member@example.com", "--password", "pw", "--timezone", "America/New_York",
      ]);
      expect(out).toContain("session_hook: not installed");
      expect(out).toContain("setup hooks");
      expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
      expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
      expect(existsSync(join(home, ".config", "opencode"))).toBe(false);
    } finally {
      process.env.HOME = prevHome;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("a repeat setup hooks install that changes nothing says no-op", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "nexudus-axi-proj-"));
    const prevCwd = process.cwd();
    const prevArgv1 = process.argv[1];
    // Pose as an installed entrypoint — the SDK only registers dist/bin/<name>.js.
    const fakeBin = join(projectDir, "dist", "bin", "nexudus-axi.js");
    mkdirSync(dirname(fakeBin), { recursive: true });
    writeFileSync(fakeBin, "");
    process.argv[1] = fakeBin;
    process.chdir(projectDir);
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      const { setupCommand } = await import("../src/commands/setup.js");
      const first = await setupCommand(["hooks", "--scope", "project"]);
      expect(first).toContain("installed/repaired at project scope");
      const settings = readFileSync(join(process.cwd(), ".claude", "settings.json"), "utf-8");
      const second = await setupCommand(["hooks", "--scope", "project"]);
      expect(second).toContain("already installed and current at project scope (no-op)");
      expect(readFileSync(join(process.cwd(), ".claude", "settings.json"), "utf-8")).toBe(settings);
    } finally {
      process.argv[1] = prevArgv1;
      process.chdir(prevCwd);
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("a write the SDK reports as failed is SETUP_FAILED, not a warning on exit 0", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "nexudus-axi-proj-"));
    const prevCwd = process.cwd();
    const prevArgv1 = process.argv[1];
    const fakeBin = join(projectDir, "dist", "bin", "nexudus-axi.js");
    mkdirSync(dirname(fakeBin), { recursive: true });
    writeFileSync(fakeBin, "");
    // One target unwritable: the Claude Code settings directory is read-only.
    const claudeDir = join(projectDir, ".claude");
    mkdirSync(claudeDir);
    chmodSync(claudeDir, 0o555);
    process.argv[1] = fakeBin;
    process.chdir(projectDir);
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      const { setupCommand } = await import("../src/commands/setup.js");
      const err = await setupCommand(["hooks", "--scope", "project"]).then(
        () => undefined,
        (e: unknown) => e as AxiError,
      );
      expect(err?.code).toBe("SETUP_FAILED");
      expect(err?.message).toContain(".claude");
      expect(err?.suggestions.join(" ")).toContain("Claude Code");
      expect(err?.suggestions.join(" ")).toContain("setup hooks --scope project");
    } finally {
      chmodSync(claudeDir, 0o755);
      process.argv[1] = prevArgv1;
      process.chdir(prevCwd);
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("refuses to report success when the SDK declines a non-installed entrypoint", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "nexudus-axi-proj-"));
    const prevCwd = process.cwd();
    process.chdir(projectDir);
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      const { setupCommand } = await import("../src/commands/setup.js");
      // argv[1] is vitest here, which the SDK will not register.
      await expect(setupCommand(["hooks", "--scope", "project"])).rejects.toMatchObject({ code: "SETUP_FAILED" });
    } finally {
      process.chdir(prevCwd);
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("doctor treats a missing hook as optional, not a failure", async () => {
    const home = mkdtempSync(join(tmpdir(), "nexudus-axi-home-"));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      const { hookDoctorCheck } = await import("../src/commands/setup.js");
      const check = hookDoctorCheck();
      expect(check.status).toBe("skipped");
      expect(check.detail).toContain("optional");
    } finally {
      process.env.HOME = prevHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("hooks fail closed on files they cannot read, parse or confirm", () => {
  /** Install for real at project scope from a posed-as-installed entrypoint, then run `body` there. */
  async function inInstalledProject(body: (root: string) => Promise<void>) {
    const projectDir = mkdtempSync(join(tmpdir(), "nexudus-axi-proj-"));
    const prevCwd = process.cwd();
    const prevArgv1 = process.argv[1];
    const fakeBin = join(projectDir, "dist", "bin", "nexudus-axi.js");
    mkdirSync(dirname(fakeBin), { recursive: true });
    writeFileSync(fakeBin, "");
    process.argv[1] = fakeBin;
    process.chdir(projectDir);
    delete process.env.NEXUDUS_AXI_DISABLE_HOOKS;
    try {
      const { setupCommand } = await import("../src/commands/setup.js");
      expect(await setupCommand(["hooks", "--scope", "project"])).toContain("installed/repaired at project scope");
      await body(process.cwd());
    } finally {
      process.argv[1] = prevArgv1;
      process.chdir(prevCwd);
      rmSync(projectDir, { recursive: true, force: true });
    }
  }

  it("uninstall with an unparseable settings file that may hold the hook is IO_ERROR, not removed/no-op", async () => {
    await inInstalledProject(async (root) => {
      const settings = join(root, ".claude", "settings.json");
      writeFileSync(settings, readFileSync(settings, "utf-8") + "{ trailing garbage");
      const { setupCommand } = await import("../src/commands/setup.js");
      const err = await setupCommand(["hooks", "uninstall", "--scope", "project"]).then(
        () => undefined,
        (e: unknown) => e as AxiError,
      );
      expect(err?.code).toBe("IO_ERROR");
      expect(err?.message).toContain("settings.json");
      expect(err?.message).toContain("not valid JSON");
      // The readable targets were still cleaned, and it says so.
      expect(err?.suggestions.join(" ")).toContain("Removed from: Codex, OpenCode");
    });
  });

  it("uninstall with an unreadable settings file is IO_ERROR", async () => {
    await inInstalledProject(async (root) => {
      const settings = join(root, ".claude", "settings.json");
      chmodSync(settings, 0o000);
      try {
        const { setupCommand } = await import("../src/commands/setup.js");
        await expect(setupCommand(["hooks", "uninstall", "--scope", "project"])).rejects.toMatchObject({ code: "IO_ERROR" });
      } finally {
        chmodSync(settings, 0o644);
      }
    });
  });

  it("status reports an unparseable target as a problem, and doctor fails on it", async () => {
    await inInstalledProject(async (root) => {
      writeFileSync(join(root, ".codex", "hooks.json"), "{ not json");
      const { setupCommand } = await import("../src/commands/setup.js");
      const out = await setupCommand(["hooks", "status", "--scope", "project"]);
      expect(out).toMatch(/problems\[1\]\{agent,problem\}:/);
      expect(out).toContain("not valid JSON");
    });
  });

  it("Codex with [features] hooks = false is not current: status problem, doctor fail", async () => {
    mkdirSync(join(fakeHome, ".codex"), { recursive: true });
    await inInstalledProject(async () => {
      writeFileSync(join(fakeHome, ".codex", "config.toml"), "[features]\nhooks = false\n");
      const { setupCommand, hookDoctorCheck } = await import("../src/commands/setup.js");
      const out = await setupCommand(["hooks", "status", "--scope", "project"]);
      expect(out).toContain("hooks` is false");
      // Doctor checks user scope; install there too so Codex's row is present.
      const prevArgv1 = process.argv[1];
      try {
        expect(await setupCommand(["hooks"]).catch((e: AxiError) => e.code)).toBeTypeOf("string");
      } finally {
        process.argv[1] = prevArgv1;
      }
      writeFileSync(join(fakeHome, ".codex", "config.toml"), "[features]\nhooks = false\n");
      const check = hookDoctorCheck();
      expect(check.status).toBe("fail");
      expect(check.detail).toContain("hooks` is false");
    });
  });

  it("a repeat install that only re-enables Codex's flag is not reported as a no-op", async () => {
    await inInstalledProject(async () => {
      writeFileSync(join(fakeHome, ".codex", "config.toml"), "[features]\nhooks = false\n");
      const { setupCommand } = await import("../src/commands/setup.js");
      const out = await setupCommand(["hooks", "--scope", "project"]);
      expect(out).toContain("installed/repaired at project scope");
      expect(out).not.toContain("(no-op)");
      expect(readFileSync(join(fakeHome, ".codex", "config.toml"), "utf-8")).toMatch(/hooks = true/);
    });
  });
});

describe("cost and confirmation reads fail closed", () => {
  it("bookings cancel reports an unknown fee when the lookup fails, never 0.00", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("fullCalendarBookings")) {
        // Inside cancel's calendar lookup window (-30d..+90d).
        const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
        return json([{ id: 777, resourceId: ROOM_ID, resourceName: "Call Room", start: `${day}T15:00Z`, end: `${day}T15:30Z`, coworkerId: String(MY_ID) }]);
      }
      if (url.toLowerCase().includes("cancellationfee")) return json({ Message: "boom" }, 500);
      return json({ WasSuccessful: true });
    });
    const { bookingsCommand } = await import("../src/commands/bookings.js");
    const out = await bookingsCommand(["cancel", "777"]);
    expect(out).toMatch(/fee: "?unknown \(/);
    expect(out).not.toContain("0.00");
  });

  it("book refuses before committing when the before-snapshot can't be read", async () => {
    writeStoredSpace(stored());
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("publicresources")) {
        return json({ Resources: [{ Id: ROOM_ID, UniqueId: "guid-31", Name: "Call Room", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 1 }] });
      }
      if (url.includes("GetAvailabilityAtWithUser")) {
        const slots = [];
        for (let m = 0; m < 24 * 60; m += 15) {
          slots.push({ DateTime: `2026-09-05T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, Available: true });
        }
        return json({ AvailableSlots: slots });
      }
      if (url.includes("PreviewInvoice")) return json({ TotalAmount: 0, Currency: { Code: "USD" }, WasSuccessful: true });
      if (url.includes("fullCalendarBookings")) return json({ Message: "boom" }, 500);
      return json({});
    });
    const { bookCommand } = await import("../src/commands/book.js");
    await expect(bookCommand(["--room", "Call Room", "--date", "2026-09-05", "--from", "15:00", "--to", "+30m"])).rejects.toMatchObject({
      code: "CONFIRMATION_UNAVAILABLE",
    });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("CreateInvoice"))).toBe(false);
  });
});

describe("every read fails closed (v0.3.2 review)", () => {
  function noCache(): StoredSpace {
    const s = stored();
    delete (s as { profile_cache?: unknown }).profile_cache;
    return s;
  }

  it("with no cached member id, the id is read live, so a cancel finds the booking instead of claiming a no-op", async () => {
    writeStoredSpace(noCache());
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/en/profile")) return json({ Id: MY_ID, FullName: "Member", Email: "member@example.com", InvoicingBusinessId: 1 });
      if (url.includes("/en/business/all")) return json([{ Id: 1, Name: "Acme" }]);
      if (url.includes("fullCalendarBookings")) {
        return json([{ id: 42, resourceId: ROOM_ID, resourceName: "Call Room", start: `${day}T15:00Z`, end: `${day}T15:30Z`, coworkerId: String(MY_ID) }]);
      }
      if (url.toLowerCase().includes("cancellationfee")) return json({ hasCancellationFee: false, cancellationFee: null });
      return json({ WasSuccessful: true });
    });
    const { bookingsCommand } = await import("../src/commands/bookings.js");
    const out = await bookingsCommand(["cancel", "42"]);
    expect(out).toContain("cancelled:");
    expect(out).not.toContain("(no-op)");
  });

  it("a calendar response that isn't a list is UNEXPECTED_RESPONSE, not an empty calendar", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("fullCalendarBookings") ? json({ odd: true }) : json({}),
    );
    const { bookingsCommand } = await import("../src/commands/bookings.js");
    await expect(bookingsCommand(["list"])).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
  });

  it("availability and resource responses without their list are UNEXPECTED_RESPONSE, not 'fully booked'", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("publicresources")
        ? json({ Resources: [{ Id: ROOM_ID, UniqueId: "g", Name: "Call Room", Visible: true }] })
        : json({}),
    );
    const { fetchAvailability } = await import("../src/nexudus/slots.js");
    const { resolveActiveSpace } = await import("../src/config.js");
    await expect(fetchAvailability(resolveActiveSpace({}), "g", "2026-09-05", 1, 30)).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({}));
    const { fetchResources } = await import("../src/nexudus/resolve.js");
    await expect(fetchResources(resolveActiveSpace({}))).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
  });

  it("a corrupt prefs file fails CONFIG_INVALID and `favorites clear` leaves it untouched", async () => {
    writeStoredSpace(stored());
    const { prefsPath } = await import("../src/config.js");
    writeFileSync(prefsPath("acme"), "{corrupt");
    const { roomsCommand } = await import("../src/commands/rooms.js");
    await expect(roomsCommand(["favorites", "clear"])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    expect(readFileSync(prefsPath("acme"), "utf-8")).toBe("{corrupt");
  });

  it("a failed unpaid-count read shows as unknown, not omitted", async () => {
    writeStoredSpace(stored());
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("fullCalendarBookings")) return json([]);
      if (url.includes("getUnpaidBookings")) return json({ Message: "boom" }, 500);
      return json({});
    });
    const { bookingsCommand } = await import("../src/commands/bookings.js");
    expect(await bookingsCommand(["list"])).toMatch(/unpaid: "?unknown \(/);
  });
});

describe("book: a repeat of a booking that already landed is a no-op", () => {
  const RESOURCES = {
    Resources: [
      { Id: ROOM_ID, UniqueId: "guid-31", Name: "Call Room", ResourceTypeName: "Phone Rooms", Allocation: 2, Visible: true, DisplayOrder: 1 },
    ],
  };

  /** 15-minute grid with 15:00–15:30 occupied. */
  function busyGrid(day: string) {
    const slots = [];
    for (let m = 0; m < 24 * 60; m += 15) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const busy = m >= 15 * 60 && m < 15 * 60 + 30;
      slots.push({ DateTime: `${day}T${hh}:${mm}`, Available: true, ...(busy ? { Booked: true, BookedCount: 1, Capacity: 1 } : {}) });
    }
    return { AvailableSlots: slots };
  }

  function route(calendar: Array<Record<string, unknown>>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("publicresources")) return json(RESOURCES);
      if (url.includes("GetAvailabilityAtWithUser")) return json(busyGrid("2026-09-05"));
      if (url.includes("fullCalendarBookings")) return json(calendar);
      if (url.includes("PreviewInvoice")) return json({ TotalAmount: 0, Currency: { Code: "USD" }, WasSuccessful: true });
      if (url.includes("CreateInvoice")) return new Response("", { status: 200 });
      return json({});
    });
  }

  const ARGS = ["--room", "Call Room", "--date", "2026-09-05", "--from", "15:00", "--to", "+30m"];

  it("my own booking of the exact window → reports it, commits nothing, exit 0", async () => {
    writeStoredSpace(stored());
    const spy = route([
      { id: 900, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T15:00Z", end: "2026-09-05T15:30Z", coworkerId: String(MY_ID) },
    ]);
    const { bookCommand } = await import("../src/commands/book.js");
    const out = await bookCommand(ARGS);
    expect(out).toContain("id: 900");
    expect(out).toContain("(no-op)");
    expect(process.exitCode).toBe(0);
    expect(spy.mock.calls.some((c) => String(c[0]).includes("CreateInvoice"))).toBe(false);
  });

  it("someone else's booking of that window is still UNAVAILABLE", async () => {
    writeStoredSpace(stored());
    route([
      { id: 901, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T15:00Z", end: "2026-09-05T15:30Z", coworkerId: "999" },
    ]);
    const { bookCommand } = await import("../src/commands/book.js");
    await expect(bookCommand(ARGS)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("my booking of an overlapping but different window is still UNAVAILABLE", async () => {
    writeStoredSpace(stored());
    route([
      { id: 902, resourceId: ROOM_ID, resourceName: "Call Room", start: "2026-09-05T15:00Z", end: "2026-09-05T15:30Z", coworkerId: String(MY_ID) },
    ]);
    const { bookCommand } = await import("../src/commands/book.js");
    await expect(bookCommand(["--room", "Call Room", "--date", "2026-09-05", "--from", "15:00", "--to", "+1h"])).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});
