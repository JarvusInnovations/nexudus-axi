import { BOOKINGS_FLAGS, parseSubcommand } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function bookingsCommand(args: string[]): Promise<string> {
  const { sub } = parseSubcommand("bookings", args, BOOKINGS_FLAGS, "list");
  return notImplemented(`bookings ${sub}`, sub === "cancel" ? "book-write" : "credits-bookings-read");
}
