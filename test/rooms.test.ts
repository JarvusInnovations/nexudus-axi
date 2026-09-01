import { describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { resolveRoom, stripHtml, amenities, rateOf, type Resource } from "../src/nexudus/resolve.js";
import { compressSlots, type AvailabilitySlot } from "../src/nexudus/slots.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

function room(overrides: Partial<Resource>): Resource {
  return { Id: 1, UniqueId: "00000000-0000-0000-0000-000000000000", Name: "Room", ...overrides };
}

const ROOMS: Resource[] = [
  room({ Id: 11, Name: "[Blue] Call Room" }),
  room({ Id: 12, Name: "[Purple] Medium Meeting Room" }),
  room({ Id: 13, Name: "[Orange] Medium Meeting Room" }),
  room({ Id: 14, Name: "Boardroom" }),
];

describe("resolveRoom", () => {
  it("resolves numeric ids and unique substrings, case-insensitively", () => {
    expect(resolveRoom(ROOMS, "12").Id).toBe(12);
    expect(resolveRoom(ROOMS, "blue").Id).toBe(11);
    expect(resolveRoom(ROOMS, "ORANGE").Id).toBe(13);
  });

  it("prefers an exact name match over substring ambiguity", () => {
    const withExact = [...ROOMS, room({ Id: 15, Name: "Board" })];
    // "board" is a substring of both, but an exact match on one.
    expect(resolveRoom(withExact, "board").Id).toBe(15);
  });

  it("fails ambiguous matches with exit-2 shape listing candidates", () => {
    try {
      resolveRoom(ROOMS, "meeting room");
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("VALIDATION_ERROR");
      expect((err as AxiError).suggestions[0]).toContain("Purple");
      expect((err as AxiError).suggestions[0]).toContain("Orange");
    }
  });

  it("fails unknown refs definitively, listing known rooms", () => {
    for (const ref of ["999", "garage"]) {
      try {
        resolveRoom(ROOMS, ref);
        expect.unreachable();
      } catch (err) {
        expect((err as AxiError).code).toBe("NOT_FOUND");
      }
    }
  });
});

describe("stripHtml", () => {
  it("flattens editor markup to readable text", () => {
    const html =
      '<ul><li fr-original-style="" style="font-family: revert; color: revert;">Designed for calls &amp; 1-1s.</li><li>Costs <strong>1 credit</strong>/hr.</li></ul>';
    expect(stripHtml(html)).toBe("Designed for calls & 1-1s.\nCosts 1 credit/hr.");
  });
});

describe("amenities / rateOf", () => {
  it("lists only true amenity flags", () => {
    const r = room({ Internet: true, NaturalLight: true, Projector: false, WhiteBoard: null });
    expect(amenities(r)).toEqual(["internet", "natural light"]);
  });

  it("rate falls back through PriceFormatted → Price → blank", () => {
    expect(rateOf(room({ PriceFormatted: "$10.00/hr" }))).toBe("$10.00/hr");
    expect(rateOf(room({ Price: 25 }))).toBe("25");
    expect(rateOf(room({ Price: 0, PriceFormatted: null }))).toBe("");
  });
});

describe("compressSlots", () => {
  const slot = (t: string, available: boolean): AvailabilitySlot => ({
    DateTime: `2026-09-02T${t}`,
    Available: available,
  });

  it("merges consecutive same-state slots into half-open ranges", () => {
    const slots = [
      slot("09:00", true),
      slot("09:30", true),
      slot("10:00", false),
      slot("10:30", false),
      slot("11:00", true),
    ];
    const { free, booked } = compressSlots(slots, 30);
    expect(free).toEqual([
      { from: "2026-09-02T09:00", to: "2026-09-02T10:00" },
      { from: "2026-09-02T11:00", to: "2026-09-02T11:30" },
    ]);
    expect(booked).toEqual([{ from: "2026-09-02T10:00", to: "2026-09-02T11:00" }]);
  });

  it("closes a range at a gap in the grid", () => {
    const slots = [slot("09:00", true), slot("13:00", true)];
    const { free } = compressSlots(slots, 30);
    expect(free).toEqual([
      { from: "2026-09-02T09:00", to: "2026-09-02T09:30" },
      { from: "2026-09-02T13:00", to: "2026-09-02T13:30" },
    ]);
  });

  it("rolls a range across midnight and month boundaries correctly", () => {
    const slots: AvailabilitySlot[] = [
      { DateTime: "2026-09-30T23:30", Available: true },
      { DateTime: "2026-10-01T00:00", Available: true },
    ];
    const { free } = compressSlots(slots, 30);
    expect(free).toEqual([{ from: "2026-09-30T23:30", to: "2026-10-01T00:30" }]);
  });

  it("handles empty grids", () => {
    expect(compressSlots([], 30)).toEqual({ free: [], booked: [] });
  });
});
