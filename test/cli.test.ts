import { describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { formatError } from "../src/cli.js";
import { parseFlags } from "../src/flags.js";

process.env.NEXUDUS_AXI_DISABLE_HOOKS = "1";

describe("formatError", () => {
  it("maps usage-shaped AxiError codes to exit 2", () => {
    for (const code of ["USAGE", "UNKNOWN_FLAG", "VALIDATION_ERROR"]) {
      const { exitCode, output } = formatError(new AxiError("bad input", code, ["fix it"]));
      expect(exitCode).toBe(2);
      expect(output).toContain("bad input");
      expect(output).toContain(code);
    }
  });

  it("maps operational AxiErrors to exit 1", () => {
    const { exitCode } = formatError(new AxiError("nope", "NOT_FOUND"));
    expect(exitCode).toBe(1);
  });

  it("wraps unexpected throws as INTERNAL_ERROR with no stack trace", () => {
    const { exitCode, output } = formatError(new Error("boom"));
    expect(exitCode).toBe(1);
    expect(output).toContain("INTERNAL_ERROR");
    expect(output).not.toMatch(/^\s+at /m);
  });
});

describe("global --space flag", () => {
  it("is accepted on any command without declaration", () => {
    const parsed = parseFlags("credits", ["--space", "acme"], {});
    expect(parsed.flags["--space"]).toBe("acme");
  });

  it("supports --space=slug form", () => {
    const parsed = parseFlags("credits", ["--space=acme"], {});
    expect(parsed.flags["--space"]).toBe("acme");
  });

  it("still rejects unknown flags with the valid set inlined", () => {
    try {
      parseFlags("rooms list", ["--stat", "x"], { value: ["--type"], boolean: ["--available"] });
      expect.unreachable();
    } catch (err) {
      expect((err as AxiError).code).toBe("UNKNOWN_FLAG");
      expect((err as AxiError).suggestions.join(" ")).toContain("--type");
    }
  });
});
