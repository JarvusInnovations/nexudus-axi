import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import {
  baseUrlForSpace,
  listSpaceSlugs,
  normalizeSpaceSlug,
  readStoredSpace,
  resolveActiveSpace,
  setDefaultSpace,
  writeStoredSpace,
  type StoredSpace,
} from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

function fakeSpace(slug: string): StoredSpace {
  return {
    space: slug,
    base_url: baseUrlForSpace(slug),
    email: "member@example.com",
    access_token: `token-${slug}`,
    refresh_token: `refresh-${slug}`,
    token_obtained_at: "2026-09-01T00:00:00Z",
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
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NEXUDUS_AXI_CONFIG_DIR;
  delete process.env.NEXUDUS_AXI_TOKEN;
  delete process.env.NEXUDUS_AXI_SPACE;
});

describe("normalizeSpaceSlug", () => {
  it("accepts slugs and full hosts", () => {
    expect(normalizeSpaceSlug("acme")).toBe("acme");
    expect(normalizeSpaceSlug("Acme")).toBe("acme");
    expect(normalizeSpaceSlug("acme.spaces.nexudus.com")).toBe("acme");
    expect(normalizeSpaceSlug("https://acme.spaces.nexudus.com/en/x")).toBe("acme");
  });

  it("rejects non-nexudus hosts", () => {
    expect(() => normalizeSpaceSlug("members.acme.example")).toThrowError(/not a space slug/);
  });
});

describe("space store", () => {
  it("round-trips a stored space and lists slugs", () => {
    writeStoredSpace(fakeSpace("acme"));
    writeStoredSpace(fakeSpace("globex"));
    expect(listSpaceSlugs()).toEqual(["acme", "globex"]);
    expect(readStoredSpace("acme")?.access_token).toBe("token-acme");
  });
});

describe("resolveActiveSpace", () => {
  it("errors definitively with nothing stored", () => {
    try {
      resolveActiveSpace({});
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("NO_TOKEN");
    }
  });

  it("uses the single stored space", () => {
    writeStoredSpace(fakeSpace("acme"));
    const active = resolveActiveSpace({});
    expect(active.space).toBe("acme");
    expect(active.source).toBe("single");
  });

  it("uses the default among several; --space overrides it", () => {
    writeStoredSpace(fakeSpace("acme"));
    writeStoredSpace(fakeSpace("globex"));
    setDefaultSpace("globex");
    expect(resolveActiveSpace({}).space).toBe("globex");
    expect(resolveActiveSpace({}).source).toBe("default");
    const flagged = resolveActiveSpace({ spaceFlag: "acme.spaces.nexudus.com" });
    expect(flagged.space).toBe("acme");
    expect(flagged.source).toBe("flag");
  });

  it("requires an explicit space for mutations with 2+ stored", () => {
    writeStoredSpace(fakeSpace("acme"));
    writeStoredSpace(fakeSpace("globex"));
    setDefaultSpace("globex");
    try {
      resolveActiveSpace({ mutation: true });
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("SPACE_REQUIRED");
      expect((err as AxiError).suggestions.join(" ")).toContain("acme");
      expect((err as AxiError).suggestions.join(" ")).toContain("globex");
    }
    // Explicit flag satisfies the guard.
    expect(resolveActiveSpace({ mutation: true, spaceFlag: "acme" }).space).toBe("acme");
  });

  it("env token wins over everything but needs a space name", () => {
    writeStoredSpace(fakeSpace("acme"));
    process.env.NEXUDUS_AXI_TOKEN = "env-token";
    try {
      resolveActiveSpace({});
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("SPACE_REQUIRED");
    }
    process.env.NEXUDUS_AXI_SPACE = "globex";
    const active = resolveActiveSpace({});
    expect(active.source).toBe("env");
    expect(active.space).toBe("globex");
    expect(active.token).toBe("env-token");
  });

  it("errors listing options when multiple stored and no default", () => {
    writeStoredSpace(fakeSpace("acme"));
    writeStoredSpace(fakeSpace("globex"));
    try {
      resolveActiveSpace({});
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("NO_DEFAULT_SPACE");
    }
  });
});
