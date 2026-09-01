---
status: in-progress
depends: [rooms-read, credits-bookings-read]
specs:
  - specs/commands/book.md
  - specs/commands/bookings.md
  - specs/api/bookings.md
issues: []
---

# Plan: Booking writes — book (preview→commit) and cancel

## Scope

**In:** `book` (resolve → PreviewInvoice → commit via newBookingJson, `--dry-run`, mandatory cost output, all four spec'd failure modes), `bookings cancel` (fee check → deletejson, idempotent re-cancel). Live verification of the **unverified** write contracts: newBookingJson response, deletejson body/response, the paid-beyond-credits refusal shape — spec updates in this PR. **Out:** booking updates/reschedules, visitors, products, custom-field submission (v1 boundaries, spec'd as errors where relevant).

## Implements

- `specs/commands/book.md` — full surface.
- `specs/commands/bookings.md` — the cancel subcommand.
- `specs/api/bookings.md` — de-unverifying the write endpoints.

## Approach

Verification requires committing real bookings on a live space: use a low-stakes resource, immediately cancel, and confirm the credit ledger round-trips (book consumes → cancel restores, or the fee rule if not). Capture every response body for fixtures (scrubbed). The mutation guard (2+ spaces → explicit `--space`) is enforced in the shared resolve path from foundation — validate it end-to-end here.

## Validation

- [ ] `book --dry-run` prices a credit-covered window correctly and commits nothing (verified against live availability after).
- [ ] `book` creates a real booking; output states id + cost/credits; the booking is visible in `bookings` and the portal.
- [ ] Unavailable window → `UNAVAILABLE` with the slots suggestion; rule violation names the limit (live: exceed a resource's MaxBookingLength).
- [ ] `bookings cancel` cancels it, reports the fee (0 outside the window), restores credits; re-cancel → no-op exit 0.
- [ ] Mutation guard: with two stored spaces and no `--space`, `book` and `cancel` exit 2 before any network call.
- [ ] Spec updates merged for the write contracts; fixtures scrubbed.

## Risks / unknowns

- `ChargeNow: true` semantics for credit bookings vs paid — if a paid-beyond-credits booking silently creates an unpaid invoice instead of refusing, `book` must detect it via the preview totals and refuse client-side per spec.
- Late-cancellation fee behavior can't be safely exercised live without eating a fee — fixture-only.

## Notes

_(closeout)_

## Follow-ups

_(closeout)_
