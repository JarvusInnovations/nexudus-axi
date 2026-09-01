# Architecture

## Stack

- **Runtime:** Node.js ≥ 20 (asdf-pinned: bun + nodejs). Authored in TypeScript (ESM), run via `bun` in dev, compiled with `tsc` to `dist/` for distribution.
- **CLI runtime:** [`axi-sdk-js`](https://www.npmjs.com/package/axi-sdk-js) (`runAxiCli`) — command-first dispatch, bare `--help`/`--version`, home-header injection, TOON serialization, structured errors, session-hook installer.
- **Output:** [TOON](https://toonformat.dev/) via `@toon-format/toon`, at the output boundary only.
- **HTTP:** the platform `fetch`. No SDK exists for this surface — we wrap the reverse-engineered portal API directly ([api/conventions](api/conventions.md)).
- **Tests:** vitest, in `test/` mirroring `src/`, with `fetch` spies and `XDG_CONFIG_HOME` stubbed to a temp dir; `NEXUDUS_AXI_DISABLE_HOOKS=1` set unconditionally.

## Project structure

Follows calendly-axi's shape (which follows harvest-axi + remarkable-axi):

```
bin/nexudus-axi.ts         # shebang entry → src/cli.ts main()
src/
├── cli.ts                 # runAxiCli wiring, formatError (USAGE/UNKNOWN_FLAG/VALIDATION_ERROR → exit 2;
│                          #   unexpected throws wrapped as INTERNAL_ERROR — no stack trace on stdout)
├── flags.ts               # declared per-command flag sets; unknown flags rejected with valid set inlined;
│                          #   --space is an always-allowed global (parsed before command dispatch)
├── reference.ts           # COMMAND_GROUPS: single source for top-level help, per-command --help, SKILL.md
├── version.ts             # package version at runtime (no build stamping)
├── config.ts              # multi-space store: config.json (default space) + spaces/{slug}/token.json (0600)
├── nexudus/
│   ├── client.ts          # per-space authed fetch: bearer + Accept + nx-app-version headers,
│   │                      #   401→refresh-once→retry, error translation (incl. HTML-body guard)
│   ├── token.ts           # password/refresh grants against /api/token
│   ├── resolve.ts         # room resolution: numeric id | name substring → {id, guid, name, rules}
│   └── slots.ts           # AvailableSlots[] → contiguous free/booked ranges
├── output/                # FieldDef/render helpers ported from the sibling tools
├── time/wallclock.ts      # human date/time forms → space wall-clock strings (fake-Z aware);
│                          #   space-timezone "today"/"tomorrow" via Intl
└── commands/
    ├── home.ts
    ├── auth.ts            # login / status / use / logout
    ├── doctor.ts
    ├── setup.ts           # hooks install / status / uninstall
    ├── rooms.ts           # list / view / slots
    ├── credits.ts
    ├── book.ts
    └── bookings.ts        # list / view / cancel
```

## Config & state

Per [spaces-and-accounts](behaviors/spaces-and-accounts.md): `$XDG_CONFIG_HOME/nexudus-axi` or `~/.config/nexudus-axi` (dir 0700); `config.json` `{version, default_space}`; `spaces/{slug}/token.json` (0600) holding tokens + profile cache. Env overrides: `NEXUDUS_AXI_TOKEN` (+ `NEXUDUS_AXI_SPACE`), `NEXUDUS_AXI_CONFIG_DIR`, `NEXUDUS_AXI_DISABLE_HOOKS`.

## Docs & skill generation

`src/reference.ts` is the single source for top-level help, per-command `--help`, and the installable skill at `skills/nexudus-axi/SKILL.md` (static content, `npx -y nexudus-axi ...` forms). `bun run docs` regenerates; `bun run docs:check` fails CI when stale.

## Build & distribution

- `bun run build` → `tsc` → `dist/` + `chmod +x`; `bun run check` → `tsc --noEmit`; single tsconfig, `test/` excluded from the compiled set (calendly-axi's proven shape).
- Published `bin`: `nexudus-axi → dist/bin/nexudus-axi.js`; `files: ["dist", "skills/nexudus-axi", "LICENSE", "README.md"]`; public access.
- Releases: develop → main Release-PR flow (infra-components actions); npm publish on GitHub release. Repo shell per the **repo-setup** house conventions.
- CI (`ci.yml`): install → check → build → test → docs:check, plus a no-credentials smoke test (structured error, exit 1, no stack trace).

## Principles

**Inherited** — [Translate errors](principles.md#translate-errors-never-leak-raw-api-noise) (the formatError wrapper + smoke test enforce it at the process boundary); [Reverse-engineered surface, spec'd honestly](principles.md#reverse-engineered-surface-specd-honestly) (the `nx-app-version` header and doctor's resources-read canary live here).
