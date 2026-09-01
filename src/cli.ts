import { AxiError, exitCodeForError, runAxiCli } from "axi-sdk-js";
import { encode } from "@toon-format/toon";
import { DESCRIPTION, renderCommandHelp, renderTopLevelHelp } from "./reference.js";
import { version } from "./version.js";
import { homeCommand } from "./commands/home.js";
import { authCommand } from "./commands/auth.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { roomsCommand } from "./commands/rooms.js";
import { creditsCommand } from "./commands/credits.js";
import { bookCommand } from "./commands/book.js";
import { bookingsCommand } from "./commands/bookings.js";

/**
 * Error codes that represent a malformed invocation rather than a failed
 * operation. AXI §6 requires these to exit 2, but the SDK only maps its own
 * `VALIDATION_ERROR` that way — so they are re-mapped here.
 */
const USAGE_CODES = new Set(["USAGE", "UNKNOWN_FLAG", "VALIDATION_ERROR"]);

function renderFailure(message: string, code: string, suggestions: string[]): string {
  const output: Record<string, unknown> = { error: message, code };
  if (suggestions.length > 0) output.help = suggestions;
  // Written verbatim by the SDK, so the trailing newline is ours.
  return `${encode(output)}\n`;
}

/**
 * Exported (rather than inlined into the `runAxiCli` call) so the
 * USAGE-set→2 mapping and INTERNAL_ERROR wrapping are unit-testable without
 * exercising the full CLI dispatch.
 */
export function formatError(error: unknown): { output: string; exitCode: number } {
  if (error instanceof AxiError) {
    return {
      output: renderFailure(error.message, error.code, error.suggestions),
      exitCode: USAGE_CODES.has(error.code) ? 2 : exitCodeForError(error),
    };
  }

  // Never let a raw dependency error or stack trace reach stdout — an agent
  // would try to read it as data.
  const message = error instanceof Error ? error.message : String(error);
  return {
    output: renderFailure(`unexpected failure: ${message}`, "INTERNAL_ERROR", [
      "Run `nexudus-axi doctor` to check credentials and connectivity",
    ]),
    exitCode: 1,
  };
}

export async function main(argv: string[] = process.argv.slice(2)) {
  await runAxiCli({
    description: DESCRIPTION,
    version,
    argv,
    topLevelHelp: renderTopLevelHelp(),
    getCommandHelp: renderCommandHelp,
    home: async (args) => homeCommand(args),
    commands: {
      auth: async (args) => authCommand(args),
      doctor: async (args) => doctorCommand(args),
      setup: async (args) => setupCommand(args),
      rooms: async (args) => roomsCommand(args),
      credits: async (args) => creditsCommand(args),
      book: async (args) => bookCommand(args),
      bookings: async (args) => bookingsCommand(args),
    },
    formatError,
  });
}
