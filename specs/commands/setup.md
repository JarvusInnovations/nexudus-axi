# Command: setup

Session-hook lifecycle, mirroring the sibling tools (calendly-axi/harvest-axi) and AXI §7.

## setup hooks

`nexudus-axi setup hooks [status|uninstall] [--scope user|project]`

- `setup hooks` — installs/repairs the SessionStart hook (Claude Code `~/.claude/settings.json`; Codex and OpenCode per AXI §7 as the SDK supports them) running the bare `nexudus-axi` home view. PATH-verified binary name when it resolves to the current executable, absolute path otherwise; repairs a stale path. A repeat install that changes no file reports `already installed and current at <scope> scope (no-op)`. After installing, the hook is re-read for every app: if any is missing or not pointing at the current executable (the SDK declines to register a non-installed entrypoint, e.g. a source checkout), the command fails `SETUP_FAILED` (exit 1) naming the apps, rather than reporting success. A write the SDK reports as failed (its `onError`, e.g. EACCES on one app's settings file or the OpenCode plugin) is likewise `SETUP_FAILED` (exit 1) carrying every reported message and the apps left without a current hook — never a warning on a zero exit.
- `--scope` (default `user`) selects where the hook lives, passed through to the SDK's scope support: `user` targets each agent's home-directory config; `project` targets the current repository's per-project config (e.g. `<cwd>/.claude/settings.json`) so the hook travels with a project instead of the machine. All three subcommands honor it; `status` reports the requested scope's targets.
- `setup hooks status` — installed? pointing at the current executable? which apps? A target file that exists but cannot be read or parsed is reported as a `problems[]` row naming the file and error — never as "not installed". Codex counts as current only when `~/.codex/config.toml` has `[features] hooks = true` (always the user's config, whatever the scope — where the SDK writes it); otherwise the problem names the flag.
- `setup hooks uninstall` — removes the hook(s) in the given scope; idempotent. A target that exists but cannot be read, parsed or written fails `IO_ERROR` (exit 1) naming each such file and what *was* removed — never a "removed"/no-op claim while a hook may remain.
- **Fail closed everywhere (AXI §6).** Install's no-op detection snapshots the Codex `config.toml` too. A failed install's `SETUP_FAILED` names the agents that *were* installed as well as those that weren't, and its hint names the file problem (permissions or invalid JSON) rather than assuming permissions.
- `NEXUDUS_AXI_DISABLE_HOOKS=1` disables all hook writes (tests set this unconditionally).
- `setup hooks` is the **only** path that writes a hook (AXI §7: register only from a user-invoked setup command, never as a side effect of an ordinary command). `auth login` reports the hook's state and suggests `setup hooks`; it never installs.

## Principles

**Inherited** — [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations).
