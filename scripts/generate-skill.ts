#!/usr/bin/env bun
/**
 * Renders `skills/nexudus-axi/SKILL.md` from `src/reference.ts`'s
 * COMMAND_GROUPS — the same single source that drives the top-level
 * `--help` listing and every per-command `--help` block, so the installable
 * skill can never drift from the CLI's own guidance. Deterministic: same
 * source, byte-identical output. See `specs/architecture.md` ("Docs & skill
 * generation") and the AXI §7 skill-publishing rules.
 *
 * Usage:
 *   bun run docs          # regenerate skills/nexudus-axi/SKILL.md
 *   bun run docs:check    # fail (nonzero) if the committed file is stale
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_GROUPS, DESCRIPTION, type CommandDoc, type CommandGroup } from "../src/reference.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SKILL_MD_PATH = join(REPO_ROOT, "skills", "nexudus-axi", "SKILL.md");

// AXI §7: a skill may be loaded without the package installed globally, so
// every runnable example uses the no-install-required `npx -y` form.
const BIN = "nexudus-axi";
const NPX_BIN = `npx -y ${BIN}`;

/** Rewrite a `nexudus-axi ...` example from COMMAND_GROUPS to its npx form. */
function npxify(example: string): string {
  return example.startsWith(`${BIN} `) ? `${NPX_BIN}${example.slice(BIN.length)}` : example;
}

// Trigger-shaped frontmatter (AXI §7): terse, outcome-focused, so an agent
// loads this skill on the right intent.
const FRONTMATTER = `---
name: nexudus-axi
description: >-
  Book rooms at a Nexudus-powered coworking space — see which rooms are free
  for a meeting, view any room's day at a glance, check booking-credit
  balances, book a room (priced before commit), and list or cancel your
  bookings. Use when asked about coworking room bookings: "which rooms are
  free at 4pm", "book the call room tomorrow 2-3", "what do I have booked",
  "cancel my booking", "how many room credits do I have", or anything about
  a Nexudus member portal. Triggers on "Nexudus", "coworking", "book a room",
  "room credits", "meeting room", "call room", "day pass".
---`;

function renderPitch(): string {
  const afterDash = DESCRIPTION.split("—")[1]?.trim() ?? DESCRIPTION;
  return [
    "# nexudus-axi",
    "",
    `An [AXI](https://axi.md)-compliant CLI for the Nexudus coworking member portal — ${afterDash}. Token-efficient [TOON](https://toonformat.dev/) output; rooms resolve by id or name fragment; times are the space's local wall-clock (never UTC-converted).`,
    "",
    "> This skill is static. For live state at session start (your bookings and credits, no invocation needed), install the SessionStart hook instead (see the project README) — the hook and this skill are two paths to the same tool; you only need one.",
    "",
    `Every example below runs via \`${NPX_BIN}\` so it works whether or not the package is installed globally. If \`${BIN}\` is already on PATH, drop the \`npx -y\` prefix.`,
  ].join("\n");
}

/** Quick-start intro for the Setup group. */
function renderSetupIntro(): string {
  return [
    "```sh",
    "printf 'Password: ' && read -rs pw && echo && printf '%s' \"$pw\" | \\",
    `  ${NPX_BIN} auth login --space <slug> --email <email> --password-stdin --timezone <iana>; unset pw`,
    "```",
    "",
    `\`<slug>\` is the space's subdomain on spaces.nexudus.com. The password is exchanged for tokens and never stored; pipe it via \`--password-stdin\` (recommended), pass \`--password\`, or set \`NEXUDUS_AXI_PASSWORD\`. Pass \`--timezone\` (IANA) — the API doesn't expose the space's zone. Verify with \`${npxify(`${BIN} doctor`)}\`.`,
  ].join("\n");
}

function renderCommandDoc(doc: CommandDoc): string {
  const lines: string[] = [`### \`${BIN} ${doc.usage}\``, "", doc.summary, ""];

  if (doc.flags?.length) {
    lines.push("Flags:", "");
    for (const flag of doc.flags) lines.push(`- ${flag}`);
    lines.push("");
  }

  if (doc.examples?.length) {
    lines.push("```sh");
    for (const example of doc.examples) lines.push(npxify(example));
    lines.push("```", "");
  }

  return lines.join("\n").trimEnd();
}

function renderGroup(group: CommandGroup, intro?: string): string {
  const body = intro ? [intro, ...group.commands.map(renderCommandDoc)] : group.commands.map(renderCommandDoc);
  return [`## ${group.group}`, ...body].join("\n\n");
}

function renderFooter(): string {
  return [
    "## Getting help",
    "",
    `Run \`${npxify(`${BIN} <command> --help`)}\` for any command's full flag reference. Run \`${NPX_BIN}\` (no args, needs credentials) for the live home view — or skip the invocation entirely by installing the SessionStart hook (\`${npxify(`${BIN} setup hooks`)}\`). \`--space <slug>\` on any command selects the space when several are connected.`,
  ].join("\n");
}

/** Pure render — same COMMAND_GROUPS in, byte-identical Markdown out. */
export function renderSkillMarkdown(): string {
  const setupGroup = COMMAND_GROUPS.find((group) => group.group === "Setup");
  const otherGroups = COMMAND_GROUPS.filter((group) => group.group !== "Setup");

  const sections = [
    FRONTMATTER,
    "",
    renderPitch(),
    "",
    ...(setupGroup ? [renderGroup(setupGroup, renderSetupIntro()), ""] : []),
    ...otherGroups.flatMap((group) => [renderGroup(group), ""]),
    renderFooter(),
    "",
  ];

  return sections.join("\n");
}

function writeSkill(): void {
  mkdirSync(dirname(SKILL_MD_PATH), { recursive: true });
  writeFileSync(SKILL_MD_PATH, renderSkillMarkdown());
}

function checkSkill(): void {
  const generated = renderSkillMarkdown();

  let committed: string;
  try {
    committed = readFileSync(SKILL_MD_PATH, "utf-8");
  } catch {
    console.error(
      "skills/nexudus-axi/SKILL.md does not exist yet.\nRun `bun run docs` to generate it, then commit the result.",
    );
    process.exit(1);
    return;
  }

  if (generated === committed) {
    console.error("skills/nexudus-axi/SKILL.md is up to date.");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "nexudus-axi-docs-"));
  const freshPath = join(dir, "SKILL.md");
  writeFileSync(freshPath, generated);

  console.error(
    [
      "skills/nexudus-axi/SKILL.md is stale — src/reference.ts (or its docs generator) changed without regenerating it.",
      `A freshly generated copy was written to: ${freshPath}`,
      `Diff it against the committed file: diff ${SKILL_MD_PATH} ${freshPath}`,
      "Run `bun run docs` to regenerate, then commit skills/nexudus-axi/SKILL.md.",
    ].join("\n"),
  );
  process.exit(1);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    checkSkill();
  } else {
    writeSkill();
    console.error(`wrote ${SKILL_MD_PATH}`);
  }
}
