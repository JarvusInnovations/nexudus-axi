import { DOCTOR_FLAGS, parseFlags } from "../flags.js";
import { notImplemented } from "./stub.js";

export async function doctorCommand(args: string[]): Promise<string> {
  parseFlags("doctor", args, DOCTOR_FLAGS);
  return notImplemented("doctor", "auth-spaces");
}
