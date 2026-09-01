---
status: in-progress
depends: [release-v1]
specs:
  - specs/commands/setup.md
issues: []
---

# Plan: Project-scope hooks + portable login examples

## Scope

**In:** `setup hooks [status|uninstall] --scope user|project` passing through the SDK's scope support (axi-sdk-js ≥ 0.1.11 — the scope/projectDir options), with status/uninstall resolving the requested scope's config paths; login examples in README, the SKILL generator, and the CLI's no-password error switch from the 1Password-specific `op read` form to a portable `read -s` pipe. **Out:** per-agent scope selection (all agents get the same scope per invocation), auto-detecting "am I in a repo".

## Implements

- `specs/commands/setup.md` — the `--scope` flag across install/status/uninstall.

## Approach

Add `--scope` to SETUP_FLAGS subcommands; validate `user|project`; pass `{scope, projectDir: process.cwd()}` to `installSessionStartHooks`; parameterize the hand-rolled status/uninstall target paths by scope (project → `<cwd>/.claude/settings.json` + `<cwd>/.codex/hooks.json`; OpenCode plugins stay user-scoped when the SDK offers no project variant — status says so).

## Validation

- [ ] `setup hooks --scope project` writes the hook into `<cwd>/.claude/settings.json` (temp-dir test) and leaves `~/.claude` untouched.
- [ ] `status --scope project` and `uninstall --scope project` read/remove the same targets; user scope unchanged by default.
- [ ] Invalid `--scope` → exit 2 naming the two values.
- [ ] No `op read` remains in README, SKILL.md, or CLI output (grep).

## Risks / unknowns

- The SDK's OpenCode plugin path may be user-only; if so, project scope covers Claude Code + Codex and the status output names the limitation.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
