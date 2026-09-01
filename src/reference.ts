export const DESCRIPTION =
  "Agent-ergonomic CLI for the Nexudus coworking member portal — see what rooms are free, what it costs, and book it";

export interface CommandDoc {
  usage: string;
  summary: string;
  flags?: string[];
  examples?: string[];
}

export interface CommandGroup {
  group: string;
  commands: CommandDoc[];
}

/**
 * The one place the v1 command surface is described. The home view's help
 * lines, every `--help` block, and the generated `skills/nexudus-axi/SKILL.md`
 * all derive from this, so documentation cannot drift from the
 * implementation. This is a skeleton as of `foundation` — every command
 * here is currently a stub; per-command detail sharpens as each plan lands.
 *
 * `--space <slug>` is accepted on every command (multi-space selection) and
 * deliberately not repeated in each flags block.
 */
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: "Booking loop",
    commands: [
      {
        usage: "rooms [list|view|slots|free|day|favorites] [<args>] [flags]",
        summary: "Bookable resources — what exists, when it's free, and your go-to favorites",
        flags: [
          "--type <name>      filter by resource type (list/free/day)",
          "--available        only resources available now (list)",
          "--date <when>      day to check — YYYY-MM-DD, today, tomorrow, +Nd (slots/free/day; default today)",
          "--days <n>         days of slots to fetch (slots; default 1)",
          "--interval <min>   slot granularity in minutes (slots; default 30)",
          "--from <time>      meeting start, e.g. 4pm or 16:00 (free; default: the current :15 block — i.e. right now)",
          "--to <time|+dur>   meeting end (free; default +1h)",
          "--hours <H-H>      day-view window in 24h hours (day; default 8-20)",
          "--all              consider every room, not just favorites (free/day)",
        ],
        examples: [
          "nexudus-axi rooms",
          "nexudus-axi rooms free --from 4pm            # which rooms fit my 4pm meeting?",
          "nexudus-axi rooms day --date tomorrow        # every room's free ranges at a glance",
          "nexudus-axi rooms favorites add 'call room'  # set your day-to-day lens",
          "nexudus-axi rooms view <room>",
          "nexudus-axi rooms slots <room> --date tomorrow",
        ],
      },
      {
        usage: "book --room <room> --date <when> --from <time> --to <time|+dur> [--dry-run]",
        summary: "Price and create a booking — always reports what it cost (credits and/or dollars)",
        flags: [
          "--room <room>   required — room id or name",
          "--date <when>   required — YYYY-MM-DD, today, tomorrow, +Nd",
          "--from <time>   required — start, e.g. 14:00 or 2pm",
          "--to <time>     required — end, e.g. 15:00, 3pm, or a duration like +1h",
          "--dry-run       price the booking and stop — nothing is committed",
        ],
        examples: [
          "nexudus-axi book --room 'Call Room' --date today --from 2pm --to +1h --dry-run",
          "nexudus-axi book --room <id> --date 2026-09-05 --from 10:00 --to 12:00",
        ],
      },
      {
        usage: "bookings [list|view|cancel] [<id>] [flags]",
        summary: "Your bookings — upcoming by default, with cancellation (fee-aware)",
        flags: [
          "--date <when>   narrow the list to one day",
          "--days <n>      window width from today (default 7)",
          "--all           include past bookings in the window",
        ],
        examples: [
          "nexudus-axi bookings",
          "nexudus-axi bookings view <id>",
          "nexudus-axi bookings cancel <id>",
        ],
      },
      {
        usage: "credits",
        summary: "Booking-credit balances (personal and team) — what you can spend on rooms",
        examples: ["nexudus-axi credits"],
      },
    ],
  },
  {
    group: "Setup",
    commands: [
      {
        usage: "auth [login|status|use|logout] [<slug>] [flags]",
        summary: "Connect a space with your member credentials, inspect or switch stored spaces",
        flags: [
          "--email <email>       member login email (login)",
          "--password-stdin      read the password from stdin — pipe it from a secret manager; keeps it out of history (login)",
          "--password <pw>       inline password — lands in shell history; best kept to CI secret interpolation (login)",
          "                      (NEXUDUS_AXI_PASSWORD env is the third channel; the password is used once and never stored)",
          "--totp <code>         2FA code when the account requires it (login)",
          "--timezone <iana>     the space's timezone, when the API doesn't expose it (login)",
          "--refresh             re-validate tokens and refresh profile caches (status)",
        ],
        examples: [
          "printf 'Password: ' && read -rs pw && echo && printf '%s' \"$pw\" | nexudus-axi auth login --space acme --email you@example.com --password-stdin; unset pw",
          "nexudus-axi auth status",
          "nexudus-axi auth use acme",
          "nexudus-axi auth logout --space acme",
        ],
      },
      {
        usage: "doctor",
        summary:
          "Five ordered health checks — credentials, token, profile cache, resources read, hooks — exit 1 on any failure",
        examples: ["nexudus-axi doctor"],
      },
      {
        usage: "setup hooks [status|uninstall]",
        summary:
          "Manage the SessionStart hook that injects the home view at session start — bare `setup hooks` installs/repairs",
        examples: [
          "nexudus-axi setup hooks",
          "nexudus-axi setup hooks status",
          "nexudus-axi setup hooks uninstall",
        ],
      },
    ],
  },
];

/** Flat lookup of a command's documentation by its first word. */
export function commandDoc(name: string): CommandDoc | undefined {
  for (const group of COMMAND_GROUPS) {
    for (const doc of group.commands) {
      const first = doc.usage.split(" ")[0];
      if (first === name) return doc;
    }
  }
  return undefined;
}

/** Render the `--help` block for a single top-level command. */
export function renderCommandHelp(name: string): string | null {
  const doc = commandDoc(name);
  if (!doc) return null;

  const lines = [`usage: nexudus-axi ${doc.usage}`, "", doc.summary];

  if (doc.flags?.length) {
    lines.push("", "flags:");
    for (const flag of doc.flags) lines.push(`  ${flag}`);
  }

  if (doc.examples?.length) {
    lines.push("", "examples:");
    for (const example of doc.examples) lines.push(`  ${example}`);
  }

  lines.push("", "`--space <slug>` selects the space on any command when several are connected.");

  // The SDK writes this string verbatim, so the trailing newline is ours.
  return `${lines.join("\n")}\n`;
}

/** Render the top-level help listing every command by group. */
export function renderTopLevelHelp(): string {
  const lines = [
    `nexudus-axi — ${DESCRIPTION}`,
    "",
    "usage: nexudus-axi <command> [args] [flags]",
  ];

  for (const group of COMMAND_GROUPS) {
    lines.push("", `${group.group}:`);
    const width = Math.max(...group.commands.map((c) => c.usage.length));
    for (const doc of group.commands) {
      lines.push(`  ${doc.usage.padEnd(width)}  ${doc.summary}`);
    }
  }

  lines.push(
    "",
    "`--space <slug>` on any command selects the space when several are connected.",
    "Run `nexudus-axi <command> --help` for usage on any command.",
    "Run `nexudus-axi` with no arguments for your bookings and credits.",
  );

  return lines.join("\n");
}
