import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { authCommand } from "../src/commands/auth.js";
import { doctorCommand } from "../src/commands/doctor.js";
import {
  baseUrlForSpace,
  getDefaultSpace,
  listSpaceSlugs,
  readStoredSpace,
  tokenPath,
  writeStoredSpace,
  type StoredSpace,
} from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

const SLUG = "acme";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch spy that routes by URL substring — order-independent. */
function routeFetch(routes: Array<[string, () => Response]>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [needle, make] of routes) {
      if (url.includes(needle)) return make();
    }
    throw new Error(`unrouted fetch in test: ${url}`);
  });
}

const COWORKER = {
  Id: 100000002,
  FullName: "Member Example",
  Email: "member@example.com",
  HomeSpaceId: 100000009,
  InvoicingBusinessId: 100000009,
  SimpleTimeZoneId: 5,
};

const BUSINESSES = [{ Id: 100000009, Name: "Acme Coworking" }];

function stored(slug = SLUG): StoredSpace {
  return {
    space: slug,
    base_url: baseUrlForSpace(slug),
    email: "member@example.com",
    access_token: `token-${slug}`,
    refresh_token: `refresh-${slug}`,
    token_obtained_at: new Date().toISOString(),
    profile_cache: {
      coworker_id: 100000002,
      coworker_name: "Member Example",
      email: "member@example.com",
      business_id: 100000009,
      business_name: "Acme Coworking",
      timezone: "America/New_York",
      cached_at: new Date().toISOString(),
    },
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexudus-axi-test-"));
  process.env.NEXUDUS_AXI_CONFIG_DIR = dir;
  delete process.env.NEXUDUS_AXI_TOKEN;
  delete process.env.NEXUDUS_AXI_SPACE;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
});

describe("auth login", () => {
  it("exchanges the password, bootstraps the profile, stores tokens at 0600, never the password", async () => {
    routeFetch([
      ["/api/token", () => jsonResponse({ access_token: "at1", refresh_token: "rt1" })],
      ["/en/profile", () => jsonResponse(COWORKER)],
      ["/en/business/all", () => jsonResponse(BUSINESSES)],
    ]);

    const out = await authCommand([
      "login",
      "--space", "acme.spaces.nexudus.com",
      "--email", "member@example.com",
      "--password", "s3cret",
      "--timezone", "America/New_York",
    ]);

    expect(out).toContain("connected");
    expect(out).toContain("Member Example");
    expect(out).toContain("Acme Coworking");

    const persisted = readStoredSpace(SLUG)!;
    expect(persisted.access_token).toBe("at1");
    expect(persisted.refresh_token).toBe("rt1");
    expect(persisted.profile_cache?.coworker_id).toBe(100000002);
    expect(persisted.profile_cache?.timezone).toBe("America/New_York");

    const raw = readFileSync(tokenPath(SLUG), "utf-8");
    expect(raw).not.toContain("s3cret");
    expect(statSync(tokenPath(SLUG)).mode & 0o777).toBe(0o600);

    // First space becomes the default automatically.
    expect(getDefaultSpace()).toBe(SLUG);
  });

  it("exits usage-shaped when required flags are missing", async () => {
    try {
      await authCommand(["login", "--space", "acme"]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("USAGE");
      expect((err as AxiError).message).toContain("--email");
    }
  });

  it("fails usage-shaped with no password channel, leading with the stdin pipe", async () => {
    try {
      await authCommand(["login", "--space", "acme", "--email", "m@example.com"]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("USAGE");
      expect((err as AxiError).suggestions[0]).toContain("--password-stdin");
    }
  });

  it("rejects --password combined with --password-stdin", async () => {
    try {
      await authCommand([
        "login", "--space", "acme", "--email", "m@example.com",
        "--password", "pw", "--password-stdin",
      ]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("USAGE");
      expect((err as AxiError).message).toContain("mutually exclusive");
    }
  });

  it("falls back to NEXUDUS_AXI_PASSWORD from the environment", async () => {
    process.env.NEXUDUS_AXI_PASSWORD = "envpw";
    try {
      routeFetch([
        ["/api/token", () => jsonResponse({ access_token: "at1", refresh_token: "rt1" })],
        ["/en/profile", () => jsonResponse(COWORKER)],
        ["/en/business/all", () => jsonResponse(BUSINESSES)],
      ]);
      const out = await authCommand(["login", "--space", "acme", "--email", "m@example.com"]);
      expect(out).toContain("connected");
      const raw = readFileSync(tokenPath(SLUG), "utf-8");
      expect(raw).not.toContain("envpw");
    } finally {
      delete process.env.NEXUDUS_AXI_PASSWORD;
    }
  });

  it("rejects a bogus timezone before any network call", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await authCommand([
        "login", "--space", "acme", "--email", "m@example.com",
        "--password", "pw", "--timezone", "Mars/Olympus",
      ]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("VALIDATION_ERROR");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("preserves a previously-set timezone on re-login without --timezone", async () => {
    writeStoredSpace(stored());
    routeFetch([
      ["/api/token", () => jsonResponse({ access_token: "at2", refresh_token: "rt2" })],
      ["/en/profile", () => jsonResponse(COWORKER)],
      ["/en/business/all", () => jsonResponse(BUSINESSES)],
    ]);
    await authCommand(["login", "--space", SLUG, "--email", "m@example.com", "--password", "pw"]);
    expect(readStoredSpace(SLUG)?.profile_cache?.timezone).toBe("America/New_York");
    expect(readStoredSpace(SLUG)?.access_token).toBe("at2");
  });
});

describe("auth status / use / logout", () => {
  it("status lists spaces with the default marked", async () => {
    writeStoredSpace(stored("acme"));
    writeStoredSpace(stored("globex"));
    const out = await authCommand(["status"]);
    expect(out).toContain("acme");
    expect(out).toContain("globex");
  });

  it("status is definitive when nothing is connected", async () => {
    const out = await authCommand(["status"]);
    expect(out).toContain("no spaces connected");
  });

  it("use switches the default and is idempotent", async () => {
    writeStoredSpace(stored("acme"));
    writeStoredSpace(stored("globex"));
    expect(await authCommand(["use", "globex"])).toContain("default space set to globex");
    expect(await authCommand(["use", "globex"])).toContain("already the default (no-op)");
    expect(getDefaultSpace()).toBe("globex");
  });

  it("use errors listing connected spaces for an unknown slug", async () => {
    writeStoredSpace(stored("acme"));
    try {
      await authCommand(["use", "nowhere"]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("SPACE_NOT_FOUND");
      expect((err as AxiError).suggestions.join(" ")).toContain("acme");
    }
  });

  it("logout removes the single space; re-logout is a no-op", async () => {
    writeStoredSpace(stored());
    expect(await authCommand(["logout"])).toContain("logged out of acme");
    expect(listSpaceSlugs()).toEqual([]);
    expect(await authCommand(["logout"])).toContain("no stored spaces (no-op)");
  });

  it("logout with 2+ spaces requires an explicit --space", async () => {
    writeStoredSpace(stored("acme"));
    writeStoredSpace(stored("globex"));
    try {
      await authCommand(["logout"]);
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("SPACE_REQUIRED");
    }
    expect(await authCommand(["logout", "--space", "globex"])).toContain("logged out of globex");
    expect(listSpaceSlugs()).toEqual(["acme"]);
  });
});

describe("doctor", () => {
  it("reports all-skipped-after-credentials-fail with exit intent when nothing is connected", async () => {
    const out = await doctorCommand([]);
    expect(out).toContain("healthy: false");
    expect(out).toContain("credentials,fail");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("passes the healthy path and flags a missing timezone", async () => {
    const s = stored();
    delete s.profile_cache!.timezone;
    writeStoredSpace(s);
    routeFetch([
      ["/en/profile", () => jsonResponse(COWORKER)],
      ["/en/publicresources", () => jsonResponse({ Resources: [{ Name: "Room A" }] })],
    ]);
    const out = await doctorCommand([]);
    expect(out).toContain("credentials,ok");
    expect(out).toContain("token,ok");
    expect(out).toContain("timezone is unset");
    expect(out).toContain("resources read,ok");
    process.exitCode = 0;
  });

  it("fails the resources canary when publicresources comes back empty", async () => {
    writeStoredSpace(stored());
    routeFetch([
      ["/en/profile", () => jsonResponse(COWORKER)],
      ["/en/publicresources", () => jsonResponse({ Resources: [] })],
    ]);
    const out = await doctorCommand([]);
    expect(out).toContain("resources read,fail");
    expect(out).toContain("healthy: false");
    process.exitCode = 0;
  });
});
