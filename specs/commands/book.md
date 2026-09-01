# Command: book

Create a booking — the flagship mutation. Contract: [api/bookings](../api/bookings.md).

## book

`nexudus-axi book --room <room> --date <when> --from <time> --to <time|+dur> [--dry-run] [--space <slug>]`

Flow (one invocation, no prompts):

1. Resolve the room (id or name, as `rooms view`) and the wall-clock window ([time-and-timezone](../behaviors/time-and-timezone.md)).
2. **Price preview** via `PreviewInvoice`: cost in dollars, credits consumed, or both.
3. `--dry-run`: stop here. Output `would_book:` with room, window, `total:`, `credits_used:`, and availability — exit 0.
4. Commit via the basket's `CreateInvoice?createZeroValueInvoice=true` (the member path — see [api/bookings § Write endpoints](../api/bookings.md#write-endpoints-verified-live-2026-09-01)) with a fresh client-generated `UniqueId` and `ChargeNow: true`. Success is an empty 200; the booking id is recovered from the calendar feed by matching resource + window.
5. Output: `booked:` with booking id, room, window (space wall-clock), `total:` and `credits_used:` — **cost visibility is mandatory** ([Preview before commit](../principles.md#preview-before-commit-but-never-prompt)).

Failure modes (all structured, per [Translate errors](../principles.md#translate-errors-never-leak-raw-api-noise)):

- Window unavailable → `UNAVAILABLE` naming the conflicting range, suggesting `rooms slots <room> --date <date>`.
- Booking-rule violation (too long/short/late/far ahead) → the resource limit named.
- Payment required beyond credits and the API refuses → `PAYMENT_REQUIRED` explaining v1 books credit-covered/zero-value reservations and pointing at the portal for card checkout.
- Required custom fields on the resource → `CUSTOM_FIELDS_REQUIRED` naming them (v1 does not submit custom fields).

Mutation guard: with 2+ stored spaces, `--space` (or env) is required ([spaces-and-accounts](../behaviors/spaces-and-accounts.md)).

Suggestions on success: `bookings` (see it in context), `bookings cancel <id>` (undo).

## Principles

**Inherited** — [Preview before commit, but never prompt](../principles.md#preview-before-commit-but-never-prompt); [Idempotent, non-interactive mutations](../principles.md#idempotent-non-interactive-mutations) — note `book` itself is **not** idempotent (double-invoking books twice); the tool must not pretend otherwise, and the durable `UniqueId` per invocation keeps retries within one invocation from double-booking.
