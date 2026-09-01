import { HOME_FLAGS, parseFlags, str } from "../flags.js";
import { isConfigured, listSpaceSlugs, getDefaultSpace } from "../config.js";
import { joinBlocks, renderHelp, renderObject } from "../output/index.js";

/**
 * Foundation-phase home view: identifies configuration state definitively
 * (AXI §5) and points at the next step. The full ambient view (upcoming
 * bookings + credits, specs/commands/home.md) lands with `home-hooks-docs`.
 */
export async function homeCommand(args: string[]): Promise<string> {
  const parsed = parseFlags("home", args, HOME_FLAGS);
  void str(parsed, "--space"); // accepted globally; unused until the full home lands

  if (!isConfigured()) {
    return joinBlocks(
      renderObject({ status: "no space connected" }),
      renderHelp([
        "Run `nexudus-axi auth login --space <slug> --email <email> --password <pw>` to connect",
      ]),
    );
  }

  const slugs = listSpaceSlugs();
  return joinBlocks(
    renderObject({
      spaces: slugs.join(", ") || "(env token)",
      default: getDefaultSpace() ?? (slugs.length === 1 ? slugs[0] : undefined) ?? "(unset)",
      status: "connected — booking commands land plan by plan (see plans/)",
    }),
    renderHelp([
      "Run `nexudus-axi rooms` to see bookable rooms (rooms-read plan)",
      "Run `nexudus-axi doctor` to check credentials (auth-spaces plan)",
    ]),
  );
}
