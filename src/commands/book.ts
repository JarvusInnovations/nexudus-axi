import { BOOK_FLAGS, parseFlags } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function bookCommand(args: string[]): Promise<string> {
  parseFlags("book", args, BOOK_FLAGS);
  return notImplemented("book");
}
