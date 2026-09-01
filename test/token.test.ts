import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiError } from "axi-sdk-js";
import { passwordGrant, refreshGrant } from "../src/nexudus/token.js";

const BASE = "https://acme.spaces.nexudus.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("passwordGrant", () => {
  it("posts a form-encoded password grant and reads snake_case tokens", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    );
    const pair = await passwordGrant(BASE, "member@example.com", "pw+special", "123456");
    expect(pair).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/token`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
    const body = String(init?.body);
    expect(body).toContain("grant_type=password");
    expect(body).toContain("username=member%40example.com");
    expect(body).toContain("password=pw%2Bspecial");
    expect(body).toContain("totp=123456");
  });

  it("reads PascalCase token fields too (spec: response shape unverified)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ AccessToken: "at", RefreshToken: "rt" }),
    );
    const pair = await passwordGrant(BASE, "m@example.com", "pw");
    expect(pair.accessToken).toBe("at");
    expect(pair.refreshToken).toBe("rt");
  });

  it("translates a 400 into AUTH_FAILED with a login suggestion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "invalid_grant", error_description: "Invalid user name or password" }, 400),
    );
    try {
      await passwordGrant(BASE, "m@example.com", "wrong");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("AUTH_FAILED");
      expect((err as AxiError).message).toContain("Invalid user name or password");
    }
  });

  it("suggests --totp when the rejection mentions 2FA", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error_description: "A TOTP code is required" }, 400),
    );
    try {
      await passwordGrant(BASE, "m@example.com", "pw");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).suggestions.join(" ")).toContain("--totp");
    }
  });
});

describe("refreshGrant", () => {
  it("posts a refresh grant", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ access_token: "at2", refresh_token: "rt2" }),
    );
    const pair = await refreshGrant(BASE, "m@example.com", "rt1");
    expect(pair.accessToken).toBe("at2");
    expect(String(spy.mock.calls[0]![1]?.body)).toContain("grant_type=refresh_token");
    expect(String(spy.mock.calls[0]![1]?.body)).toContain("refresh_token=rt1");
    const headers = spy.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.client_id).toBe("nexudus.portal.m@example.com");
  });

  it("fails structured when the response has no recognizable pair", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    try {
      await refreshGrant(BASE, "m@example.com", "rt1");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("UNEXPECTED_RESPONSE");
    }
  });
});
