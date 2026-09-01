import { CREDITS_FLAGS, parseFlags } from "../flags.js";
import { nexudusRequest } from "../nexudus/client.js";
import { computed, joinBlocks, renderHelp, renderList, renderObject } from "../output/index.js";
import { activeSpaceFrom } from "./auth.js";

/** `credits` — see `specs/commands/credits.md`. */

const BENEFITS_SHAPE = [
  "Personal.BookingCredits.Id",
  "Personal.BookingCredits.Name",
  "Personal.BookingCredits.TotalCredit",
  "Personal.BookingCredits.RemainingCredit",
  "Personal.BookingCredits.ExpireDate",
  "Personal.BookingCredits.CaneBeUsedForBookings",
  "Personal.TimePasses.Id",
  "Personal.TimePasses.TimePass.Name",
  "Personal.TimePasses.TotalUses",
  "Personal.TimePasses.RemainingUses",
  "Personal.ExtraServices.Id",
  "Personal.ExtraServices.ExtraService.Name",
  "Personal.ExtraServices.TotalUses",
  "Personal.ExtraServices.RemainingUses",
  "Team.BookingCredits.Id",
  "Team.BookingCredits.Name",
  "Team.BookingCredits.TotalCredit",
  "Team.BookingCredits.RemainingCredit",
  "Team.BookingCredits.ExpireDate",
  "Team.BookingCredits.CaneBeUsedForBookings",
  "Team.TimePasses.Id",
  "Team.TimePasses.TimePass.Name",
  "Team.TimePasses.TotalUses",
  "Team.TimePasses.RemainingUses",
].join(",");

interface BookingCredit {
  Name?: string;
  TotalCredit?: number;
  RemainingCredit?: number;
  ExpireDate?: string;
  /** sic — the API misspells it; kept verbatim (specs/api/coworker.md). */
  CaneBeUsedForBookings?: boolean;
}

interface TimePass {
  TimePass?: { Name?: string };
  TotalUses?: number | null;
  RemainingUses?: number | null;
}

interface ExtraService {
  ExtraService?: { Name?: string };
  TotalUses?: number | null;
  RemainingUses?: number | null;
}

interface BenefitGroup {
  BookingCredits?: BookingCredit[];
  TimePasses?: TimePass[];
  ExtraServices?: ExtraService[];
}

interface BenefitsResponse {
  Personal?: BenefitGroup;
  Team?: BenefitGroup;
}

const CREDIT_SCHEMA = [
  computed("scope", (i) => i.scope),
  computed("name", (i) => (i.credit as BookingCredit).Name ?? ""),
  computed("remaining", (i) => (i.credit as BookingCredit).RemainingCredit ?? 0),
  computed("total", (i) => (i.credit as BookingCredit).TotalCredit ?? 0),
  computed("expires", (i) => ((i.credit as BookingCredit).ExpireDate ?? "").slice(0, 10)),
];

const USES_SCHEMA = [
  computed("scope", (i) => i.scope),
  computed("name", (i) => i.name),
  computed("remaining", (i) => i.remaining ?? "unlimited"),
];

export async function creditsCommand(args: string[]): Promise<string> {
  const parsed = parseFlags("credits", args, CREDITS_FLAGS);
  const active = activeSpaceFrom(parsed);

  const benefits = await nexudusRequest<BenefitsResponse>(
    active,
    "/api/public/coworkers/profiles/current/benefits",
    { query: { _shape: BENEFITS_SHAPE } },
  );

  const scoped = [
    ["personal", benefits.Personal],
    ["team", benefits.Team],
  ] as const;

  const credits = scoped.flatMap(([scope, group]) =>
    (group?.BookingCredits ?? [])
      .filter((c) => c.CaneBeUsedForBookings === true)
      .map((credit) => ({ scope, credit })),
  );

  const dedupe = (rows: Array<{ scope: string; name: string; remaining: number | null | undefined }>) => {
    // Collapse identical allowance rows (memberships grant the same pass N times).
    const byKey = new Map<string, { scope: string; name: string; remaining: number | null | undefined; count: number }>();
    for (const row of rows) {
      const key = `${row.scope}|${row.name}|${row.remaining ?? "u"}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { ...row, count: 1 });
    }
    return [...byKey.values()].map((r) => ({
      scope: r.scope,
      name: r.count > 1 ? `${r.name} ×${r.count}` : r.name,
      remaining: r.remaining,
    }));
  };

  const passes = dedupe(
    scoped.flatMap(([scope, group]) =>
      (group?.TimePasses ?? []).map((p) => ({
        scope,
        name: p.TimePass?.Name ?? "",
        remaining: p.RemainingUses,
      })),
    ),
  );

  const services = dedupe(
    scoped.flatMap(([scope, group]) =>
      (group?.ExtraServices ?? []).map((s) => ({
        scope,
        name: s.ExtraService?.Name ?? "",
        remaining: s.RemainingUses,
      })),
    ),
  );

  const blocks = [renderObject({ space: active.space })];

  if (credits.length === 0) {
    blocks.push(renderObject({ credits: `no booking credits on ${active.space}` }));
  } else {
    blocks.push(renderList("credits", credits as unknown as Array<Record<string, unknown>>, CREDIT_SCHEMA));
  }
  if (passes.length > 0) {
    blocks.push(renderList("passes", passes as unknown as Array<Record<string, unknown>>, USES_SCHEMA));
  }
  if (services.length > 0) {
    blocks.push(renderList("services", services as unknown as Array<Record<string, unknown>>, USES_SCHEMA));
  }
  blocks.push(
    renderHelp([
      "Run `nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur> --dry-run` to see what a booking would cost",
      "Run `nexudus-axi rooms` to see what the credits can book",
    ]),
  );
  return joinBlocks(...blocks);
}
