---
status: done
depends: [release-v1]
specs:
  - specs/commands/setup.md
issues: []
pr: 10
---

# Plan: Project-scope hooks + portable login examples

## Scope

**In:** `setup hooks [status|uninstall] --scope user|project` passing through the SDK's scope support (axi-sdk-js ≥ 0.1.11 — the scope/projectDir options), with status/uninstall resolving the requested scope's config paths; login examples in README, the SKILL generator, and the CLI's no-password error switch from the 1Password-specific `op read` form to a portable `read -s` pipe. **Out:** per-agent scope selection (all agents get the same scope per invocation), auto-detecting "am I in a repo".

## Implements

- `specs/commands/setup.md` — the `--scope` flag across install/status/uninstall.

## Approach

Add `--scope` to SETUP_FLAGS subcommands; validate `user|project`; pass `{scope, projectDir: process.cwd()}` to `installSessionStartHooks`; parameterize the hand-rolled status/uninstall target paths by scope (project → `<cwd>/.claude/settings.json` + `<cwd>/.codex/hooks.json`; OpenCode plugins stay user-scoped when the SDK offers no project variant — status says so).

## Validation

- [x] `setup hooks --scope project` writes the hook into `<cwd>/.claude/settings.json` (temp-dir test) and leaves `~/.claude` untouched.
- [x] `status --scope project` and `uninstall --scope project` read/remove the same targets; user scope unchanged by default.
- [x] Invalid `--scope` → exit 2 naming the two values.
- [x] No `op read` remains in README, SKILL.md, or CLI output (grep).

## Risks / unknowns

- The SDK's OpenCode plugin path may be user-only; if so, project scope covers Claude Code + Codex and the status output names the limitation.

## Notes

- The OpenCode risk didn't materialize: the SDK project-scopes OpenCode too (`<projectDir>/.opencode/plugins/`), so all three agents get project scope — the status output's scope/root header makes the target visible.
- The status table asserts on the `root:` header (the table's columns carry commands, not paths); macOS `/var`→`/private/var` realpathing matters in tests.
- `doctor`'s hooks check stays pinned to user scope — the ambient-session contract it verifies is the user-level one.

## Follow-ups

None.
