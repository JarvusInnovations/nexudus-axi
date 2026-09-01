import { AxiError } from "axi-sdk-js";

/**
 * Wall-clock time handling per specs/behaviors/time-and-timezone.md.
 *
 * The Nexudus API speaks the space's local wall-clock serialized with a
 * literal `Z` that does NOT mean UTC. Everything here therefore works on
 * calendar components ({y,m,d} + {h,min}), never on absolute instants:
 * a `Date` object appears only (a) pinned to UTC as a pure component-math
 * vehicle (UTC has no DST, so day arithmetic can't slip), and (b) inside
 * `Intl` to read the space's current calendar day.
 */

export interface WallDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export interface WallTime {
  h: number; // 0-23
  min: number; // 0-59
}

// ── Space-calendar "now" ────────────────────────────────────────────
/** The current calendar date in an IANA zone (defaults to the machine zone). */
export function todayInZone(zone?: string, now: Date = new Date()): WallDate {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    ...(zone ? { timeZone: zone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA renders YYYY-MM-DD.
  const [y, m, d] = fmt.format(now).split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Calendar-day arithmetic via UTC component overflow — DST-immune by construction. */
export function addDays(date: WallDate, days: number): WallDate {
  const shifted = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

// ── Flag parsing ────────────────────────────────────────────────────
const DATE_FORMS = "YYYY-MM-DD, today, tomorrow, yesterday, +Nd/-Nd, +Nw/-Nw";

/**
 * Parse a `--date` value: a literal date or a deterministic token, resolved
 * on the space's calendar. Weekday names are deliberately rejected — they
 * have no non-guessing resolution (see the behavior spec's Local principle).
 */
export function parseDateFlag(value: string, zone?: string, now: Date = new Date()): WallDate {
  const v = value.trim().toLowerCase();

  const literal = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (literal) {
    const date = { y: Number(literal[1]), m: Number(literal[2]), d: Number(literal[3]) };
    // Round-trip through the overflow-normalizer to reject 2026-02-31 etc.
    const normalized = addDays(date, 0);
    if (normalized.y !== date.y || normalized.m !== date.m || normalized.d !== date.d) {
      throw new AxiError(`"${value}" is not a real calendar date`, "VALIDATION_ERROR", [
        `Accepted --date forms: ${DATE_FORMS}`,
      ]);
    }
    return date;
  }

  if (v === "today") return todayInZone(zone, now);
  if (v === "tomorrow") return addDays(todayInZone(zone, now), 1);
  if (v === "yesterday") return addDays(todayInZone(zone, now), -1);

  const relative = v.match(/^([+-])(\d+)([dw])$/);
  if (relative) {
    const sign = relative[1] === "-" ? -1 : 1;
    const n = Number(relative[2]);
    const unit = relative[3] === "w" ? 7 : 1;
    return addDays(todayInZone(zone, now), sign * n * unit);
  }

  throw new AxiError(`"${value}" is not a recognized date`, "VALIDATION_ERROR", [
    `Accepted --date forms: ${DATE_FORMS}`,
  ]);
}

const TIME_FORMS = "HH:MM (24h), H[:MM]am/pm (2pm, 9:30am)";

/** Parse a clock-time flag value: `14:00`, `2pm`, `9:30am`. */
export function parseTimeFlag(value: string, flagName = "--from"): WallTime {
  const v = value.trim().toLowerCase();

  const ampm = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2] !== undefined ? Number(ampm[2]) : 0;
    if (h < 1 || h > 12 || min > 59) {
      throw new AxiError(`"${value}" is not a valid clock time`, "VALIDATION_ERROR", [
        `Accepted ${flagName} forms: ${TIME_FORMS}`,
      ]);
    }
    if (ampm[3] === "pm" && h !== 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return { h, min };
  }

  const h24 = v.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = Number(h24[1]);
    const min = Number(h24[2]);
    if (h > 23 || min > 59) {
      throw new AxiError(`"${value}" is not a valid clock time`, "VALIDATION_ERROR", [
        `Accepted ${flagName} forms: ${TIME_FORMS}`,
      ]);
    }
    return { h, min };
  }

  throw new AxiError(`"${value}" is not a recognized time`, "VALIDATION_ERROR", [
    `Accepted ${flagName} forms: ${TIME_FORMS}`,
  ]);
}

/** Parse a `--to` value: a clock time, or a `+Nh`/`+Nm` duration from `from`. */
export function parseToFlag(value: string, from: WallTime): WallTime {
  const v = value.trim().toLowerCase();
  const duration = v.match(/^\+(\d+)(h|m)$/);
  if (duration) {
    const n = Number(duration[1]);
    const minutes = duration[2] === "h" ? n * 60 : n;
    const total = from.h * 60 + from.min + minutes;
    return { h: Math.floor(total / 60), min: total % 60 }; // may exceed 23:59 — window validation catches it
  }
  return parseTimeFlag(value, "--to");
}

// ── Window resolution ───────────────────────────────────────────────
export interface WallWindow {
  date: WallDate;
  from: WallTime;
  to: WallTime;
  /** API-bound fake-Z strings (specs/api/conventions.md § Timezone quirk). */
  fromApi: string;
  toApi: string;
}

/**
 * Resolve and validate a same-day half-open [from, to) window. Inverted or
 * empty windows fail loud with both resolved boundaries echoed; cross-midnight
 * windows are rejected in v1 (both per the behavior spec).
 */
export function resolveWindow(options: {
  date: string | undefined;
  from: string;
  to: string;
  zone?: string;
  now?: Date;
}): WallWindow {
  const date = parseDateFlag(options.date ?? "today", options.zone, options.now);
  const from = parseTimeFlag(options.from, "--from");
  const to = parseToFlag(options.to, from);

  const fromMin = from.h * 60 + from.min;
  const toMin = to.h * 60 + to.min;

  if (toMin > 24 * 60 || to.h > 23) {
    throw new AxiError(
      `The window crosses midnight (--from ${renderTime(from)} --to ${renderOverflowTime(to)}) — not supported`,
      "VALIDATION_ERROR",
      ["Book the two days separately"],
    );
  }
  if (toMin <= fromMin) {
    throw new AxiError(
      `Empty or inverted window: --from resolved to ${renderTime(from)}, --to resolved to ${renderTime(to)}`,
      "VALIDATION_ERROR",
      ["Windows are [from, to) — --to must be after --from (try `--to +1h`)"],
    );
  }

  return {
    date,
    from,
    to,
    fromApi: toApiWallclock(date, from),
    toApi: toApiWallclock(date, to),
  };
}

// ── Serialization ───────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

/** A wall-clock API string: local components with the API's literal-Z quirk. */
export function toApiWallclock(date: WallDate, time: WallTime): string {
  return `${date.y}-${pad(date.m)}-${pad(date.d)}T${pad(time.h)}:${pad(time.min)}:00.000Z`;
}

export function formatWallDate(date: WallDate): string {
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

export function renderTime(time: WallTime): string {
  return `${pad(time.h)}:${pad(time.min)}`;
}

function renderOverflowTime(time: WallTime): string {
  return `${time.h}:${pad(time.min)}`;
}

/**
 * Render an API datetime for output: strip the fake `Z` and present the
 * wall-clock it actually is (`2026-09-01 14:00`). Never `Date`-parse it.
 */
export function renderWallclock(apiValue: string): string {
  const match = apiValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return apiValue;
  return `${match[1]} ${match[2]}`;
}
