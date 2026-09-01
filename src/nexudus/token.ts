import { AxiError } from "axi-sdk-js";

/**
 * OAuth2 grants against a space's `/api/token`, per
 * specs/api/conventions.md § Auth. The response's exact field names are
 * flagged **unverified** in the spec — the portal client reads `AccessToken`
 * in one path and standard OAuth `access_token` in another — so both
 * conventions are accepted here until auth-spaces captures the real body
 * and the spec (then this) is tightened.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until expiry, when the response provides it. */
  expiresIn?: number;
}

function readTokenBody(body: Record<string, unknown>): TokenPair | null {
  const access = body.access_token ?? body.AccessToken;
  const refresh = body.refresh_token ?? body.RefreshToken;
  if (typeof access !== "string" || access.length === 0) return null;
  if (typeof refresh !== "string" || refresh.length === 0) return null;
  const expiresRaw = body.expires_in ?? body.ExpiresIn;
  const expiresIn =
    typeof expiresRaw === "number"
      ? expiresRaw
      : typeof expiresRaw === "string" && expiresRaw !== ""
        ? Number(expiresRaw)
        : undefined;
  return {
    accessToken: access,
    refreshToken: refresh,
    ...(expiresIn !== undefined && Number.isFinite(expiresIn) ? { expiresIn } : {}),
  };
}

async function tokenGrant(
  baseUrl: string,
  form: Record<string, string>,
  operation: string,
): Promise<TokenPair> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw new AxiError(
      `Network error on ${operation}: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR",
      ["Check connectivity and the space slug, then retry"],
    );
  }

  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON error page — handled below; never surfaced raw.
    }
  }

  if (!res.ok) {
    const description = typeof body.error_description === "string" ? body.error_description : "";
    const errCode = typeof body.error === "string" ? body.error : "";
    const detail = description || errCode;
    if (res.status === 400 || res.status === 401) {
      throw new AxiError(
        `${operation} was rejected${detail ? `: ${detail}` : ""}`,
        "AUTH_FAILED",
        detail.toLowerCase().includes("totp") || detail.toLowerCase().includes("two-factor")
          ? ["This account requires 2FA — re-run `auth login` with --totp <code>"]
          : ["Check the email/password and re-run `nexudus-axi auth login`"],
      );
    }
    throw new AxiError(`Token endpoint error (${res.status}) on ${operation}`, "SERVER_ERROR", [
      "Retry after a moment",
    ]);
  }

  const pair = readTokenBody(body);
  if (!pair) {
    throw new AxiError(
      `${operation} succeeded but the response carried no recognizable token pair`,
      "UNEXPECTED_RESPONSE",
      ["This may be a portal contract change — see specs/api/conventions.md"],
    );
  }
  return pair;
}

/** Password grant — used by `auth login`. The password is used once and never stored. */
export function passwordGrant(
  baseUrl: string,
  email: string,
  password: string,
  totp?: string,
): Promise<TokenPair> {
  return tokenGrant(
    baseUrl,
    { grant_type: "password", username: email, password, totp: totp ?? "" },
    "login",
  );
}

/** Refresh grant — used transparently by the client on 401. */
export function refreshGrant(baseUrl: string, refreshToken: string): Promise<TokenPair> {
  return tokenGrant(
    baseUrl,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    "token refresh",
  );
}
