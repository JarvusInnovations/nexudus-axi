import { AUTH_FLAGS, parseSubcommand } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function authCommand(args: string[]): Promise<string> {
  const { sub } = parseSubcommand("auth", args, AUTH_FLAGS, "status");
  return notImplemented(`auth ${sub}`, "auth-spaces");
}
