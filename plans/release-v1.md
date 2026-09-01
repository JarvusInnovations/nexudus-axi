---
status: done
depends: [book-write, home-hooks-docs]
specs:
  - specs/architecture.md
issues: []
pr: 8
---

# Plan: Release v1 — repo shell, CI hardening, npm publish

## Scope

**In:** GitHub repo per the **repo-setup** house conventions (develop default, main release target, merge-commit-only, rulesets, infra-components Release-PR workflows), `publish-npm.yml` (OIDC trusted publishing), README polish (public-facing: what it is, install, auth, the booking loop, the wall-clock warning), LICENSE (MIT), first npm publish (manual registry bootstrap), release notes. Final public-repo sweep: no tenant identifiers anywhere in history-bound files. **Out:** feature work.

## Implements

- `specs/architecture.md` — build & distribution section end-to-end.

## Approach

Mirror calendly-axi's workflows verbatim; repo-setup skill drives the shell. The identifier sweep runs over the full tree + all fixtures before the repo flips public.

## Validation

- [x] CI green on develop: check, build, test, docs:check, smoke test.
- [ ] Release PR flow produces a tagged release; npm publish succeeds; `npx -y nexudus-axi --version` matches the tag. *(Release PR opens on this merge; the first npm publish is the owner's manual registry bootstrap — see Follow-ups.)*
- [x] `grep`-sweep for tenant identifiers over tree and fixtures comes back clean.
- [x] README covers install → login → book loop in copy-pasteable form.

## Risks / unknowns

- First-publish npm bootstrap is manual (registry trust setup) — same as sibling tools.

## Notes

- Repo shell (develop default, merge-commit-only, rulesets, public) was stood up at project start rather than here — this plan's remainder was the release workflows, README (landed with home-hooks-docs), and the final sweep.
- Local npm is unauthenticated by design — the first publish is the owner's manual step, after which npm trusted publishing gets configured for the org and publish-npm.yml takes over.
- Brand-new-repo gotcha to expect: the Release PR's first workflow runs may sit at `action_required` until approved once.

## Follow-ups

- **Owner action:** first `npm publish` (registry bootstrap): merge the Release PR, then locally `npm login && bun run build && npm publish --access public` at the tagged commit; then enable trusted publishing for nexudus-axi on npmjs.com so publish-npm.yml handles every later release.
