import { HOME_FLAGS, parseFlags, str, type Parsed } from "../flags.js";
import { getDefaultSpace, isConfigured, listSpaceSlugs, resolveActiveSpace } from "../config.js";
import { fetchMyBookings, splitWallclock } from "../nexudus/mybookings.js";
import { nexudusRequest } from "../nexudus/client.js";
import { addDays, formatWallDate, todayInZone } from "../time/wallclock.js";
import { compact, computed, joinBlocks, renderHelp, renderList, renderObject } from "../output/index.js";

/**
 * The no-args ambient view (specs/commands/home.md): what's booked, what
 * could be booked — under ~25 lines, since the SessionStart hook renders
 * this at every session start.
 */

const HOME_BOOKINGS_MAX = 5;

const BOOKING_SCHEMA = [
  computed("id", (r) => r.id),
  computed("room", (r) => r.resourceName ?? ""),
  computed("date", (r) => splitWallclock(String(r.start)).date),
  computed("from", (r) => splitWallclock(String(r.start)).time),
  computed("to", (r) => splitWallclock(String(r.end)).time),
];

interface CreditRow {
  Name?: string;
  RemainingCredit?: number;
  ExpireDate?: string;
  CaneBeUsedForBookings?: boolean;
}

interface HomeBenefits {
  Personal?: { BookingCredits?: CreditRow[] };
  Team?: { BookingCredits?: CreditRow[] };
}

async function creditLines(active: ReturnType<typeof resolveActiveSpace>): Promise<string | undefined> {
  const benefits = await nexudusRequest<HomeBenefits>(active, "/api/public/coworkers/profiles/current/benefits", {
    query: {
      _shape:
        "Personal.BookingCredits.Name,Personal.BookingCredits.RemainingCredit,Personal.BookingCredits.ExpireDate,Personal.BookingCredits.CaneBeUsedForBookings,Team.BookingCredits.Name,Team.BookingCredits.RemainingCredit,Team.BookingCredits.ExpireDate,Team.BookingCredits.CaneBeUsedForBookings",
    },
  }).catch((): HomeBenefits => ({}));

  const rows = [
    ...(benefits.Personal?.BookingCredits ?? []),
    ...(benefits.Team?.BookingCredits ?? []),
  ].filter((c) => c.CaneBeUsedForBookings === true && (c.RemainingCredit ?? 0) > 0);
  if (rows.length === 0) return undefined;
  return rows
    .map((c) => `${c.RemainingCredit} ${c.Name ?? "credits"} (expires ${(c.ExpireDate ?? "").slice(0, 10)})`)
    .join("; ");
}

export async function homeCommand(args: string[]): Promise<string> {
  const parsed: Parsed = parseFlags("home", args, HOME_FLAGS);

  if (!isConfigured()) {
    return joinBlocks(
      renderObject({ status: "no space connected" }),
      renderHelp([
        "Run `nexudus-axi auth login --space <slug> --email <email> --password-stdin` to connect (pipe the password in)",
      ]),
    );
  }

  const active = resolveActiveSpace({ spaceFlag: str(parsed, "--space") });
  const zone = active.stored?.profile_cache?.timezone;
  const today = todayInZone(zone);

  const [bookings, credits] = await Promise.all([
    fetchMyBookings(active, formatWallDate(today), formatWallDate(addDays(today, 7))).catch(() => []),
    creditLines(active),
  ]);

  const others = listSpaceSlugs().filter((s) => s !== active.space);

  const blocks = [
    renderObject(
      compact({
        space: active.space,
        member: active.stored?.profile_cache?.coworker_name || undefined,
        ...(credits ? { credits } : {}),
        ...(others.length > 0 ? { other_spaces: `${others.join(", ")} (use --space)` } : {}),
      }),
    ),
  ];

  if (bookings.length === 0) {
    blocks.push(renderObject({ bookings: "nothing booked in the next 7 days" }));
  } else {
    blocks.push(
      renderList(
        "bookings",
        bookings.slice(0, HOME_BOOKINGS_MAX) as unknown as Array<Record<string, unknown>>,
        BOOKING_SCHEMA,
      ),
    );
    if (bookings.length > HOME_BOOKINGS_MAX) {
      blocks.push(renderObject({ more: `Run \`nexudus-axi bookings\` for all ${bookings.length}` }));
    }
  }

  blocks.push(
    renderHelp([
      "Run `nexudus-axi rooms free --from <time>` to find a room for a meeting",
      "Run `nexudus-axi rooms day` for every room's free ranges today",
      "Run `nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur>` to book",
      "Run `nexudus-axi --help` to see the full command list",
    ]),
  );
  return joinBlocks(...blocks);
}
