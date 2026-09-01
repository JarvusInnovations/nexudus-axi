import { AxiError } from "axi-sdk-js";

/**
 * Stub for a not-yet-built surface. Flags are already validated by the
 * caller (so unknown-flag rejection works before this fires). The message
 * speaks the user's domain — no repo internals
 * (specs/principles.md#output-speaks-the-users-domain-never-the-repos).
 */
export function notImplemented(command: string): never {
  throw new AxiError(`\`${command}\` is not implemented yet`, "NOT_IMPLEMENTED", [
    "This command is coming in an upcoming release",
    "Run `nexudus-axi --help` to see what works today",
  ]);
}
