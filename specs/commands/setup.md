# Command: setup

Session-hook lifecycle, mirroring the sibling tools (calendly-axi/harvest-axi) and AXI §7.

## setup hooks

`nexudus-axi setup hooks [status|uninstall]`

- `setup hooks` — installs/repairs the SessionStart hook (Claude Code `~/.claude/settings.json`; Codex and OpenCode per AXI §7 as the SDK supports them) running the bare `nexudus-axi` home view. PATH-verified binary name when it resolves to the current executable, absolute path otherwise; idempotent; repairs a stale path.
- `setup hooks status` — installed? pointing at the current executable? which apps?
- `setup hooks uninstall` — removes the hook(s); idempotent.
- `NEXUDUS_AXI_DISABLE_HOOKS=1` disables all hook writes (tests set this unconditionally).
- `auth login` also installs/repairs the hook as part of first-run setup (explicit user intent is present there).

## Principles

**Inherited** — [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations).
