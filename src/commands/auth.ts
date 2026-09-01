import { readFileSync } from "node:fs";
import { AxiError } from "axi-sdk-js";
import {
  baseUrlForSpace,
  clearDefaultSpace,
  getDefaultSpace,
  listSpaceSlugs,
  normalizeSpaceSlug,
  readStoredSpace,
  removeStoredSpace,
  resolveActiveSpace,
  setDefaultSpace,
  writeStoredSpace,
  type ActiveSpace,
  type StoredSpace,
} from "../config.js";
import { AUTH_FLAGS, bool, parseSubcommand, requirePositional, str, type Parsed } from "../flags.js";
import { passwordGrant } from "../nexudus/token.js";
import { fetchProfile } from "../nexudus/profile.js";
import { joinBlocks, renderHelp, renderList, renderObject } from "../output/index.js";
import { installHooks } from "./setup.js";

/** `auth login|status|use|logout` — see `specs/commands/auth.md`. */

export async function authCommand(args: string[]) {
  const { sub, parsed } = parseSubcommand("auth", args, AUTH_FLAGS, "status");
  switch (sub) {
    case "login":
      return authLogin(parsed);
    case "status":
      return authStatus(parsed);
    case "use":
      return authUse(parsed);
    case "logout":
      return authLogout(parsed);
    default:
      // Unreachable — parseSubcommand already validated `sub`.
      throw new AxiError(`unknown auth subcommand "${sub}"`, "VALIDATION_ERROR", []);
  }
}

function validateTimezone(zone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    throw new AxiError(`"${zone}" is not a valid IANA timezone`, "VALIDATION_ERROR", [
      "Use an IANA zone name like America/New_York or Europe/London",
    ]);
  }
}

const LOGIN_USAGE =
  "nexudus-axi auth login --space <slug> --email <email> (--password <pw> | --password-stdin) [--totp <code>] [--timezone <iana>]";
const STDIN_EXAMPLE =
  "Recommended: pipe from a secret manager — `op read 'op://Private/Nexudus/password' | nexudus-axi auth login --space <slug> --email <email> --password-stdin`";

/**
 * Resolve the password from exactly one of the three spec'd channels
 * (specs/commands/auth.md#auth-login): --password → --password-stdin →
 * NEXUDUS_AXI_PASSWORD. Never a prompt — reading stdin here only happens
 * when the flag explicitly asked for it, so the command can't block on a TTY
 * it wasn't told to read.
 */
function resolvePassword(parsed: Parsed): string {
  const inline = str(parsed, "--password");
  const fromStdin = bool(parsed, "--password-stdin");

  if (inline !== undefined && fromStdin) {
    throw new AxiError("--password and --password-stdin are mutually exclusive", "USAGE", [LOGIN_USAGE]);
  }
  if (inline !== undefined) return inline;

  if (fromStdin) {
    let raw = "";
    try {
      raw = readFileSync(0, "utf-8");
    } catch {
      raw = "";
    }
    const password = raw.replace(/\r?\n$/, "");
    if (password.length === 0) {
      throw new AxiError("--password-stdin was set but stdin carried no password", "USAGE", [STDIN_EXAMPLE]);
    }
    return password;
  }

  const fromEnv = process.env.NEXUDUS_AXI_PASSWORD;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;

  throw new AxiError("no password provided", "USAGE", [
    STDIN_EXAMPLE,
    "Or pass --password <pw> (lands in shell history — best kept to CI secret interpolation)",
    "Or set NEXUDUS_AXI_PASSWORD in the environment",
  ]);
}

async function authLogin(parsed: Parsed) {
  const spaceInput = str(parsed, "--space");
  const email = str(parsed, "--email");
  const totp = str(parsed, "--totp");
  const timezone = str(parsed, "--timezone");

  const missing = [!spaceInput && "--space", !email && "--email"].filter(Boolean);
  if (missing.length > 0) {
    throw new AxiError(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`, "USAGE", [
      LOGIN_USAGE,
    ]);
  }
  const password = resolvePassword(parsed);

  const slug = normalizeSpaceSlug(spaceInput!);
  const zone = timezone ? validateTimezone(timezone) : undefined;
  const baseUrl = baseUrlForSpace(slug);

  const pair = await passwordGrant(baseUrl, email!, password, totp);

  const stored: StoredSpace = {
    space: slug,
    base_url: baseUrl,
    email: email!,
    access_token: pair.accessToken,
    refresh_token: pair.refreshToken,
    token_obtained_at: new Date().toISOString(),
  };
  // Preserve an existing timezone on re-login unless a new one was given.
  const previous = readStoredSpace(slug);
  writeStoredSpace(stored);

  const active: ActiveSpace = { space: slug, baseUrl, token: pair.accessToken, stored, source: "flag" };
  const profile = await fetchProfile(active, zone ?? previous?.profile_cache?.timezone);
  stored.profile_cache = profile;
  writeStoredSpace(stored);

  // First stored space becomes the default automatically.
  const slugs = listSpaceSlugs();
  if (!getDefaultSpace() && slugs.length === 1) setDefaultSpace(slug);

  const output: Record<string, unknown> = {
    status: "connected",
    space: slug,
    member: profile.coworker_name,
    email: profile.email,
    business: profile.business_name,
    timezone: profile.timezone ?? "(unset — using the machine zone; pass --timezone <iana> to pin the space's)",
    default: getDefaultSpace() === slug,
    session_hook: installHooks(),
  };
  return renderObject(output);
}

const STATUS_SCHEMA = [
  { name: "space", extract: (i: Record<string, unknown>) => i.space },
  { name: "member", extract: (i: Record<string, unknown>) => i.member },
  { name: "email", extract: (i: Record<string, unknown>) => i.email },
  { name: "default", extract: (i: Record<string, unknown>) => i.default },
  { name: "token_age", extract: (i: Record<string, unknown>) => i.token_age },
];

function tokenAge(obtainedAt: string): string {
  const ms = Date.now() - Date.parse(obtainedAt);
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function authStatus(parsed: Parsed) {
  const refresh = bool(parsed, "--refresh");
  const slugs = listSpaceSlugs();
  const envToken = process.env.NEXUDUS_AXI_TOKEN;

  if (slugs.length === 0 && !envToken) {
    return joinBlocks(
      renderObject({ spaces: "no spaces connected" }),
      renderHelp([`Run \`${LOGIN_USAGE}\` to connect`]),
    );
  }

  const def = getDefaultSpace();
  const rows: Array<Record<string, unknown>> = [];
  for (const slug of slugs) {
    const stored = readStoredSpace(slug)!;
    let member = stored.profile_cache?.coworker_name ?? "";
    if (refresh) {
      const active: ActiveSpace = {
        space: slug,
        baseUrl: stored.base_url,
        token: stored.access_token,
        stored,
        source: "flag",
      };
      const profile = await fetchProfile(active, stored.profile_cache?.timezone);
      // fetchProfile may have rotated tokens via the client's refresh path —
      // re-read before writing so the rotation isn't clobbered.
      const current = readStoredSpace(slug) ?? stored;
      current.profile_cache = profile;
      writeStoredSpace(current);
      member = profile.coworker_name;
    }
    rows.push({
      space: slug,
      member,
      email: stored.email,
      default: slug === def || (slugs.length === 1 && !def),
      token_age: tokenAge(stored.token_obtained_at),
    });
  }

  const blocks = [renderList("spaces", rows, STATUS_SCHEMA)];
  if (envToken) {
    blocks.push(
      renderObject({
        env_override: `NEXUDUS_AXI_TOKEN is set${process.env.NEXUDUS_AXI_SPACE ? ` for space ${process.env.NEXUDUS_AXI_SPACE}` : " (no NEXUDUS_AXI_SPACE — commands will require --space)"} — it takes precedence over stored spaces`,
      }),
    );
  }
  blocks.push(
    renderHelp([
      refresh ? "Tokens re-validated and profile caches refreshed" : "Run `nexudus-axi auth status --refresh` to re-validate tokens",
      "Run `nexudus-axi auth use <slug>` to change the default space",
    ]),
  );
  return joinBlocks(...blocks);
}

function authUse(parsed: Parsed) {
  const slug = normalizeSpaceSlug(
    requirePositional(parsed, 0, "space slug", "nexudus-axi auth use <slug>"),
  );
  if (!readStoredSpace(slug)) {
    throw new AxiError(`Space "${slug}" is not connected`, "SPACE_NOT_FOUND", [
      `Connected spaces: ${listSpaceSlugs().join(", ") || "(none)"}`,
      `Run \`nexudus-axi auth login --space ${slug} ...\` to connect it first`,
    ]);
  }
  const already = getDefaultSpace() === slug;
  if (!already) setDefaultSpace(slug);
  return renderObject({
    status: already ? `${slug} is already the default (no-op)` : `default space set to ${slug}`,
  });
}

function authLogout(parsed: Parsed) {
  const flag = str(parsed, "--space");
  const slugs = listSpaceSlugs();

  let slug: string;
  if (flag) {
    slug = normalizeSpaceSlug(flag);
  } else if (slugs.length > 1) {
    // Removal is destructive enough to demand an explicit target with 2+ stored.
    throw new AxiError("Multiple spaces are stored; logout requires an explicit space", "SPACE_REQUIRED", [
      `Pass --space <slug> (one of: ${slugs.join(", ")})`,
    ]);
  } else if (slugs.length === 1) {
    slug = slugs[0]!;
  } else {
    return renderObject({ status: "no stored spaces (no-op)" });
  }

  const removed = removeStoredSpace(slug);
  if (getDefaultSpace() === slug) {
    const remaining = listSpaceSlugs();
    if (remaining[0]) setDefaultSpace(remaining[0]);
    else clearDefaultSpace();
  }
  const envNote = process.env.NEXUDUS_AXI_TOKEN
    ? " — note: NEXUDUS_AXI_TOKEN is still set, so commands keep working from the environment"
    : "";
  return renderObject({
    status: removed
      ? `logged out of ${slug} (tokens removed)${envNote}`
      : `space "${slug}" was not connected (no-op)${envNote}`,
  });
}

/**
 * Read the `--space` flag off any command's parse and resolve the active
 * space. Central so every command shares the resolution + mutation-guard
 * behavior (specs/behaviors/spaces-and-accounts.md).
 */
export function activeSpaceFrom(parsed: Parsed, options: { mutation?: boolean } = {}): ActiveSpace {
  return resolveActiveSpace({ spaceFlag: str(parsed, "--space"), mutation: options.mutation });
}
