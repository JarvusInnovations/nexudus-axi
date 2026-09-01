import { describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import {
  addDays,
  formatWallDate,
  parseDateFlag,
  parseTimeFlag,
  parseToFlag,
  renderWallclock,
  resolveWindow,
  toApiWallclock,
  todayInZone,
} from "../src/time/wallclock.js";

// A fixed instant: 2026-09-01T03:30:00Z. In America/New_York that's still
// 2026-08-31 (23:30) — the zone split is what several cases below exercise.
const NOW = new Date("2026-09-01T03:30:00Z");

describe("todayInZone", () => {
  it("resolves the calendar day in the space's zone, not UTC", () => {
    expect(todayInZone("America/New_York", NOW)).toEqual({ y: 2026, m: 8, d: 31 });
    expect(todayInZone("UTC", NOW)).toEqual({ y: 2026, m: 9, d: 1 });
    expect(todayInZone("Asia/Tokyo", NOW)).toEqual({ y: 2026, m: 9, d: 1 });
  });
});

describe("addDays", () => {
  it("rolls months and years via component overflow", () => {
    expect(addDays({ y: 2026, m: 8, d: 31 }, 1)).toEqual({ y: 2026, m: 9, d: 1 });
    expect(addDays({ y: 2026, m: 12, d: 31 }, 1)).toEqual({ y: 2027, m: 1, d: 1 });
    expect(addDays({ y: 2026, m: 3, d: 1 }, -1)).toEqual({ y: 2026, m: 2, d: 28 });
  });

  it("is DST-immune (day math never slips across a US transition)", () => {
    // US spring-forward 2026-03-08.
    expect(addDays({ y: 2026, m: 3, d: 7 }, 1)).toEqual({ y: 2026, m: 3, d: 8 });
    expect(addDays({ y: 2026, m: 3, d: 7 }, 2)).toEqual({ y: 2026, m: 3, d: 9 });
  });
});

describe("parseDateFlag", () => {
  const zone = "America/New_York";

  it("parses literals, tokens, and relative offsets on the space calendar", () => {
    expect(parseDateFlag("2026-09-05", zone, NOW)).toEqual({ y: 2026, m: 9, d: 5 });
    expect(parseDateFlag("today", zone, NOW)).toEqual({ y: 2026, m: 8, d: 31 });
    expect(parseDateFlag("tomorrow", zone, NOW)).toEqual({ y: 2026, m: 9, d: 1 });
    expect(parseDateFlag("yesterday", zone, NOW)).toEqual({ y: 2026, m: 8, d: 30 });
    expect(parseDateFlag("+2d", zone, NOW)).toEqual({ y: 2026, m: 9, d: 2 });
    expect(parseDateFlag("+1w", zone, NOW)).toEqual({ y: 2026, m: 9, d: 7 });
    expect(parseDateFlag("-1d", zone, NOW)).toEqual({ y: 2026, m: 8, d: 30 });
  });

  it("rejects impossible dates, weekday names, and junk with the accepted forms", () => {
    for (const bad of ["2026-02-31", "friday", "next week", "09/05/2026"]) {
      try {
        parseDateFlag(bad, zone, NOW);
        expect.unreachable(`expected ${bad} to be rejected`);
      } catch (err) {
        expect(err).toBeInstanceOf(AxiError);
        expect((err as AxiError).code).toBe("VALIDATION_ERROR");
        expect((err as AxiError).suggestions.join(" ")).toContain("YYYY-MM-DD");
      }
    }
  });
});

describe("parseTimeFlag / parseToFlag", () => {
  it("parses 24h and am/pm forms", () => {
    expect(parseTimeFlag("14:00")).toEqual({ h: 14, min: 0 });
    expect(parseTimeFlag("2pm")).toEqual({ h: 14, min: 0 });
    expect(parseTimeFlag("9:30am")).toEqual({ h: 9, min: 30 });
    expect(parseTimeFlag("12am")).toEqual({ h: 0, min: 0 });
    expect(parseTimeFlag("12pm")).toEqual({ h: 12, min: 0 });
  });

  it("parses durations relative to from", () => {
    expect(parseToFlag("+2h", { h: 14, min: 0 })).toEqual({ h: 16, min: 0 });
    expect(parseToFlag("+30m", { h: 14, min: 45 })).toEqual({ h: 15, min: 15 });
    expect(parseToFlag("3pm", { h: 14, min: 0 })).toEqual({ h: 15, min: 0 });
  });

  it("rejects junk with the accepted forms", () => {
    expect(() => parseTimeFlag("25:00")).toThrowError(/not a valid clock time/);
    expect(() => parseTimeFlag("2")).toThrowError(/not a recognized time/);
  });
});

describe("resolveWindow", () => {
  const zone = "America/New_York";

  it("produces fake-Z API strings carrying the wall clock verbatim", () => {
    const w = resolveWindow({ date: "2026-09-01", from: "2pm", to: "+2h", zone, now: NOW });
    expect(w.fromApi).toBe("2026-09-01T14:00:00.000Z");
    expect(w.toApi).toBe("2026-09-01T16:00:00.000Z");
  });

  it("rejects inverted and empty windows, echoing both resolved boundaries", () => {
    for (const to of ["1pm", "2pm"]) {
      try {
        resolveWindow({ date: "today", from: "2pm", to, zone, now: NOW });
        expect.unreachable("expected rejection");
      } catch (err) {
        expect((err as AxiError).code).toBe("VALIDATION_ERROR");
        expect((err as AxiError).message).toContain("14:00");
      }
    }
  });

  it("rejects cross-midnight windows", () => {
    expect(() =>
      resolveWindow({ date: "today", from: "11pm", to: "+2h", zone, now: NOW }),
    ).toThrowError(/crosses midnight/);
  });
});

describe("serialization round-trip", () => {
  it("wall clock in → fake-Z out → wall clock rendered", () => {
    const api = toApiWallclock({ y: 2026, m: 9, d: 1 }, { h: 14, min: 0 });
    expect(api).toBe("2026-09-01T14:00:00.000Z");
    expect(renderWallclock(api)).toBe("2026-09-01 14:00");
    expect(renderWallclock("2026-09-01T14:00")).toBe("2026-09-01 14:00");
  });

  it("formats dates without zone markers", () => {
    expect(formatWallDate({ y: 2026, m: 9, d: 5 })).toBe("2026-09-05");
  });
});
