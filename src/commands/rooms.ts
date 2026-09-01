import { ROOMS_FLAGS, parseSubcommand } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function roomsCommand(args: string[]): Promise<string> {
  const { sub } = parseSubcommand("rooms", args, ROOMS_FLAGS, "list");
  return notImplemented(`rooms ${sub}`, "rooms-read");
}
