import { CREDITS_FLAGS, parseFlags } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function creditsCommand(args: string[]): Promise<string> {
  parseFlags("credits", args, CREDITS_FLAGS);
  return notImplemented("credits", "credits-bookings-read");
}
