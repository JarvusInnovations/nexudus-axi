---
status: planned
depends: [book-write, home-hooks-docs]
specs:
  - specs/architecture.md
issues: []
---

# Plan: Release v1 — repo shell, CI hardening, npm publish

## Scope

**In:** GitHub repo per the **repo-setup** house conventions (develop default, main release target, merge-commit-only, rulesets, infra-components Release-PR workflows), `publish-npm.yml` (OIDC trusted publishing), README polish (public-facing: what it is, install, auth, the booking loop, the wall-clock warning), LICENSE (MIT), first npm publish (manual registry bootstrap), release notes. Final public-repo sweep: no tenant identifiers anywhere in history-bound files. **Out:** feature work.

## Implements

- `specs/architecture.md` — build & distribution section end-to-end.

## Approach

Mirror calendly-axi's workflows verbatim; repo-setup skill drives the shell. The identifier sweep runs over the full tree + all fixtures before the repo flips public.

## Validation

- [ ] CI green on develop: check, build, test, docs:check, smoke test.
- [ ] Release PR flow produces a tagged release; npm publish succeeds; `npx -y nexudus-axi --version` matches the tag.
- [ ] `grep`-sweep for tenant identifiers over tree and fixtures comes back clean.
- [ ] README covers install → login → book loop in copy-pasteable form.

## Risks / unknowns

- First-publish npm bootstrap is manual (registry trust setup) — same as sibling tools.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
