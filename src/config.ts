import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";

export const CONFIG_VERSION = 1;

/**
 * Identity + context cached from the profile bootstrap at `auth login` time
 * (specs/api/coworker.md). Every command defaults its scoping to this cached
 * self so a fresh session needs zero discovery calls.
 */
export interface ProfileCache {
  coworker_id: number;
  coworker_name: string;
  email: string;
  business_id: number;
  business_name: string;
  /** IANA zone for the space's wall clock — see specs/behaviors/time-and-timezone.md. */
  timezone?: string;
  cached_at: string;
}

/** One stored space login — spaces/{slug}/token.json (0600). */
export interface StoredSpace {
  space: string;
  base_url: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_obtained_at: string;
  profile_cache?: ProfileCache;
}

export interface UserConfig {
  version: number;
  default_space?: string;
}

/** Result of resolving which space a command acts against. */
export interface ActiveSpace {
  space: string;
  baseUrl: string;
  token: string;
  stored?: StoredSpace;
  /** Where the credential came from — surfaced by doctor/auth status. */
  source: "env" | "flag" | "default" | "single";
}

// Paths ─────────────────────────────────────────────────────────────
export function configDir(): string {
  if (process.env.NEXUDUS_AXI_CONFIG_DIR) return process.env.NEXUDUS_AXI_CONFIG_DIR;
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "nexudus-axi");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function spaceDir(slug: string): string {
  return join(configDir(), "spaces", slug);
}

export function tokenPath(slug: string): string {
  return join(spaceDir(slug), "token.json");
}

// Slug handling ─────────────────────────────────────────────────────
/**
 * Normalize a space reference to its bare slug: accepts `acme` or
 * `acme.spaces.nexudus.com` (per specs/commands/auth.md).
 */
export function normalizeSpaceSlug(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, "");
  const host = trimmed.split("/")[0]!;
  const match = host.match(/^([a-z0-9-]+)\.spaces\.nexudus\.com$/);
  if (match) return match[1]!;
  if (/^[a-z0-9-]+$/.test(host)) return host;
  throw new AxiError(`"${input}" is not a space slug or spaces.nexudus.com host`, "VALIDATION_ERROR", [
    "Pass the space's subdomain slug (e.g. `acme`) or full host (`acme.spaces.nexudus.com`)",
  ]);
}

export function baseUrlForSpace(slug: string): string {
  return `https://${slug}.spaces.nexudus.com`;
}

// Config read/write ─────────────────────────────────────────────────
export function defaultConfig(): UserConfig {
  return { version: CONFIG_VERSION };
}

/** Any unparseable config falls back to defaults — never throws. */
export function readConfig(): UserConfig {
  const path = configPath();
  if (!existsSync(path)) return defaultConfig();
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as UserConfig;
  } catch {
    return defaultConfig();
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Best-effort — a permission mismatch here shouldn't block writes.
    }
  }
}

export function writeConfig(cfg: UserConfig): void {
  ensureDir(configDir());
  writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

// Space store ───────────────────────────────────────────────────────
export function readStoredSpace(slug: string): StoredSpace | undefined {
  const path = tokenPath(slug);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StoredSpace;
  } catch {
    return undefined;
  }
}

export function writeStoredSpace(stored: StoredSpace): void {
  ensureDir(configDir());
  ensureDir(join(configDir(), "spaces"));
  ensureDir(spaceDir(stored.space));
  const path = tokenPath(stored.space);
  writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort, same rationale as ensureDir.
  }
}

/**
 * Logout removes credentials only — `prefs.json` survives so preferences
 * (favorite rooms) apply again on re-login
 * (specs/behaviors/spaces-and-accounts.md § Preferences).
 */
export function removeStoredSpace(slug: string): boolean {
  const path = tokenPath(slug);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

// Preferences ───────────────────────────────────────────────────────
export interface SpacePrefs {
  favorite_rooms?: number[];
}

export function prefsPath(slug: string): string {
  return join(spaceDir(slug), "prefs.json");
}

/** Unparseable prefs fall back to empty — never throws. */
export function readPrefs(slug: string): SpacePrefs {
  const path = prefsPath(slug);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SpacePrefs;
  } catch {
    return {};
  }
}

export function writePrefs(slug: string, prefs: SpacePrefs): void {
  ensureDir(configDir());
  ensureDir(join(configDir(), "spaces"));
  ensureDir(spaceDir(slug));
  writeFileSync(prefsPath(slug), `${JSON.stringify(prefs, null, 2)}\n`, { mode: 0o600 });
}

export function listSpaceSlugs(): string[] {
  const dir = join(configDir(), "spaces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(tokenPath(e.name)))
    .map((e) => e.name)
    .sort();
}

export function getDefaultSpace(): string | undefined {
  return readConfig().default_space;
}

export function setDefaultSpace(slug: string): void {
  const cfg = readConfig();
  cfg.default_space = slug;
  writeConfig(cfg);
}

export function clearDefaultSpace(): void {
  const cfg = readConfig();
  delete cfg.default_space;
  writeConfig(cfg);
}

// Active-space resolution ───────────────────────────────────────────
/**
 * Resolve which space a command acts against, per
 * specs/behaviors/spaces-and-accounts.md.
 * Order: env → --space flag → default → single → error.
 * Mutations with 2+ stored spaces require an explicit space (env or flag).
 */
export function resolveActiveSpace(options: {
  spaceFlag?: string;
  mutation?: boolean;
}): ActiveSpace {
  const { spaceFlag, mutation = false } = options;
  const flagSlug = spaceFlag ? normalizeSpaceSlug(spaceFlag) : undefined;

  const envToken = process.env.NEXUDUS_AXI_TOKEN;
  if (envToken && envToken.length > 0) {
    const envSpace = process.env.NEXUDUS_AXI_SPACE ?? flagSlug;
    if (!envSpace) {
      throw new AxiError(
        "NEXUDUS_AXI_TOKEN is set but no space names it",
        "SPACE_REQUIRED",
        ["Set NEXUDUS_AXI_SPACE=<slug> alongside the token, or pass --space <slug>"],
      );
    }
    const slug = normalizeSpaceSlug(envSpace);
    return {
      space: slug,
      baseUrl: baseUrlForSpace(slug),
      token: envToken,
      stored: readStoredSpace(slug),
      source: "env",
    };
  }

  const slugs = listSpaceSlugs();
  if (slugs.length === 0) {
    throw new AxiError("No Nexudus space is connected", "NO_TOKEN", [
      "Run `nexudus-axi auth login --space <slug> --email <email> --password <pw>` to connect",
    ]);
  }

  if (flagSlug) return fromStored(flagSlug, "flag");

  if (mutation && slugs.length > 1) {
    throw new AxiError(
      "Multiple spaces are stored; a mutation requires an explicit space",
      "SPACE_REQUIRED",
      [`Pass --space <slug> (one of: ${slugs.join(", ")}) or set NEXUDUS_AXI_SPACE`],
    );
  }

  const def = getDefaultSpace();
  if (def && readStoredSpace(def)) return fromStored(def, "default");
  if (slugs.length === 1) return fromStored(slugs[0]!, "single");

  throw new AxiError("No default space set and multiple are stored", "NO_DEFAULT_SPACE", [
    `Run \`nexudus-axi auth use <slug>\` (one of: ${slugs.join(", ")})`,
  ]);
}

function fromStored(slug: string, source: ActiveSpace["source"]): ActiveSpace {
  const stored = readStoredSpace(slug);
  if (!stored) {
    throw new AxiError(`Space "${slug}" is not connected`, "SPACE_NOT_FOUND", [
      `Connected spaces: ${listSpaceSlugs().join(", ") || "(none)"}`,
      `Run \`nexudus-axi auth login --space ${slug} ...\` to connect it`,
    ]);
  }
  return {
    space: slug,
    baseUrl: stored.base_url,
    token: stored.access_token,
    stored,
    source,
  };
}

export function isConfigured(): boolean {
  if (process.env.NEXUDUS_AXI_TOKEN) return true;
  return listSpaceSlugs().length > 0;
}
