import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { nexudusRequest } from "../src/nexudus/client.js";
import {
  baseUrlForSpace,
  readStoredSpace,
  writeStoredSpace,
  type ActiveSpace,
  type StoredSpace,
} from "../src/config.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

const SLUG = "acme";

function stored(): StoredSpace {
  return {
    space: SLUG,
    base_url: baseUrlForSpace(SLUG),
    email: "member@example.com",
    access_token: "stale-token",
    refresh_token: "refresh-1",
    token_obtained_at: "2026-09-01T00:00:00Z",
  };
}

function active(): ActiveSpace {
  const s = stored();
  return { space: SLUG, baseUrl: s.base_url, token: s.access_token, stored: s, source: "single" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("nexudusRequest", () => {
  it("injects the required headers", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    await nexudusRequest(active(), "/en/profile", { query: { _resource: "Coworker" } });

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe(`${baseUrlForSpace(SLUG)}/en/profile?_resource=Coworker`);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer stale-token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["nx-app-version"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(headers["User-Agent"]).toContain("nexudus-axi/");
  });

  it("refreshes exactly once on 401, persists the rotated pair, and retries", async () => {
    writeStoredSpace(stored());
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 })) // original request
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token", refresh_token: "refresh-2" })) // /api/token
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // retry

    const result = await nexudusRequest<{ ok: boolean }>(active(), "/en/profile");
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);

    const retryHeaders = spy.mock.calls[2]![1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");

    const persisted = readStoredSpace(SLUG)!;
    expect(persisted.access_token).toBe("fresh-token");
    expect(persisted.refresh_token).toBe("refresh-2");
  });

  it("fails with TOKEN_EXPIRED and a login suggestion when the refresh also fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("", { status: 400 })) // refresh rejected
      .mockResolvedValue(new Response("", { status: 401 }));

    try {
      await nexudusRequest(active(), "/en/profile");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("TOKEN_EXPIRED");
      expect((err as AxiError).suggestions.join(" ")).toContain(`auth login --space ${SLUG}`);
    }
  });

  it("never surfaces an HTML body — translates to UNEXPECTED_RESPONSE", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>Sign in</body></html>", { status: 200 }),
    );
    try {
      await nexudusRequest(active(), "/en/profile");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("UNEXPECTED_RESPONSE");
      expect((err as AxiError).message).not.toContain("<html");
    }
  });

  it("serializes array bodies (PreviewInvoice posts an array)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    await nexudusRequest(active(), "/en/basket/PreviewInvoice", {
      method: "POST",
      body: [{ Type: "booking" }],
    });
    expect(String(spy.mock.calls[0]![1]?.body)).toBe('[{"Type":"booking"}]');
  });

  it("does not attempt refresh for env-sourced credentials", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    const envActive: ActiveSpace = { ...active(), source: "env" };
    try {
      await nexudusRequest(envActive, "/en/profile");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("TOKEN_EXPIRED");
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
