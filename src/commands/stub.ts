import { AxiError } from "axi-sdk-js";

/**
 * Foundation-phase stub: flags are already validated by the caller (so
 * unknown-flag rejection works before any of this fires), then the command
 * declares itself unimplemented, naming the plan that will land it.
 */
export function notImplemented(command: string, plan: string): never {
  throw new AxiError(`\`${command}\` is not implemented yet`, "NOT_IMPLEMENTED", [
    `This command lands with the \`${plan}\` plan — see plans/${plan}.md`,
  ]);
}
