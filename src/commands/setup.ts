import { SETUP_FLAGS, parseSubcommand } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function setupCommand(args: string[]): Promise<string> {
  const { sub } = parseSubcommand("setup", args, SETUP_FLAGS, "hooks");
  return notImplemented(`setup ${sub}`, "auth-spaces");
}
