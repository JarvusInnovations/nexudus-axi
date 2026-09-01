import { AxiError } from "axi-sdk-js";
import { writeStoredSpace, type ActiveSpace } from "../config.js";
import { refreshGrant } from "./token.js";
import { version } from "../version.js";

/**
 * Portal app version sent as `nx-app-version` for fidelity with observed
 * traffic (specs/api/conventions.md § Required headers). Bump when re-capturing
 * against a newer portal.
 */
const NX_APP_VERSION = "4.0.805";

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  /** JSON body — objects and arrays both occur (PreviewInvoice posts an array). */
  body?: unknown;
  /** Skip the one-shot 401→refresh→retry (used by the refresh path itself). */
  noRefresh?: boolean;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}

/**
 * Translate a Nexudus HTTP error into an AxiError with an actionable
 * suggestion, per specs/api/conventions.md § Errors. Raw bodies — JSON or
 * HTML — never reach stdout.
 */
async function translateHttpError(res: Response, operation: string, space: string): Promise<AxiError> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    // Unreadable body — fall through with status only.
  }
  let message = "";
  if (text && !looksLikeHtml(text)) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const candidate = body.Message ?? body.message ?? body.error_description ?? body.error;
      if (typeof candidate === "string") message = candidate.slice(0, 300);
    } catch {
      message = text.slice(0, 200);
    }
  }
  const suffix = message ? `: ${message}` : "";

  switch (res.status) {
    case 401:
      return new AxiError(
        `Authentication failed on ${operation} — token invalid or expired and refresh did not recover`,
        "TOKEN_EXPIRED",
        [`Run \`nexudus-axi auth login --space ${space} ...\` to reconnect`],
      );
    case 403:
      return new AxiError(
        `Forbidden on ${operation}${suffix} — the member portal does not grant this`,
        "FORBIDDEN",
        ["This tool wraps member-portal capabilities only — see specs/principles.md"],
      );
    case 404:
      return new AxiError(`Not found on ${operation}${suffix}`, "NOT_FOUND", [
        "Run the relevant list command to find valid ids",
      ]);
    case 429:
      return new AxiError(`Rate limited on ${operation}`, "RATE_LIMITED", [
        "Wait a short while before retrying",
      ]);
    default:
      if (res.status >= 500) {
        return new AxiError(`Nexudus server error (${res.status}) on ${operation}`, "SERVER_ERROR", [
          "Retry after a moment",
        ]);
      }
      return new AxiError(`Nexudus API error ${res.status} on ${operation}${suffix}`, `NEXUDUS_API_ERROR_${res.status}`, []);
  }
}

/**
 * Make an authed request against the active space. Injects the required
 * headers, retries exactly once through the refresh grant on a 401 (persisting
 * the rotated token pair), guards against HTML bodies, and translates errors.
 */
export async function nexudusRequest<T = Record<string, unknown>>(
  active: ActiveSpace,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const operation = `${method} ${path}`;

  const attempt = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "nx-app-version": NX_APP_VERSION,
      "User-Agent": `nexudus-axi/${version} (https://github.com/JarvusInnovations/nexudus-axi)`,
    };
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    try {
      return await fetch(buildUrl(active.baseUrl, path, options.query), init);
    } catch (err) {
      throw new AxiError(
        `Network error on ${operation}: ${err instanceof Error ? err.message : String(err)}`,
        "NETWORK_ERROR",
        ["Check connectivity and retry"],
      );
    }
  };

  let res = await attempt(active.token);

  // One-shot refresh-and-retry on 401 (specs/api/conventions.md § Auth).
  if (res.status === 401 && !options.noRefresh && active.stored?.refresh_token && active.source !== "env") {
    const pair = await refreshGrant(active.baseUrl, active.stored.refresh_token).catch(() => null);
    if (pair) {
      active.token = pair.accessToken;
      active.stored = {
        ...active.stored,
        access_token: pair.accessToken,
        refresh_token: pair.refreshToken,
        token_obtained_at: new Date().toISOString(),
      };
      writeStoredSpace(active.stored);
      res = await attempt(pair.accessToken);
    }
  }

  if (!res.ok) throw await translateHttpError(res, operation, active.space);

  const text = await res.text();
  if (!text) return {} as T;
  if (looksLikeHtml(text)) {
    throw new AxiError(
      `Nexudus returned a web page instead of data on ${operation}`,
      "UNEXPECTED_RESPONSE",
      ["This usually means the session is invalid — run `nexudus-axi doctor` to diagnose"],
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AxiError(`Nexudus returned unparseable data on ${operation}`, "UNEXPECTED_RESPONSE", [
      "Run `nexudus-axi doctor` to diagnose",
    ]);
  }
}
