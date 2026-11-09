---
status: done
depends: [reads-fail-closed]
specs:
  - specs/architecture.md
  - specs/commands/book.md
  - specs/commands/bookings.md
  - specs/commands/credits.md
issues: []
pr: 28
---

# Plan: No response field is ever read as 0, none or success

## Scope

A pre-submission re-review of v0.3.3 found the root of the remaining fail-open paths: the API client
returned `{}` for an empty 200, and object-shaped reads defaulted the missing fields. **In** (most
severe first):
- An empty or price-less `PreviewInvoice` was priced at 0.00, and **the booking was committed with
  `ChargeNow: true`**.
- A cancel answered with an empty 200 counted as success, with no read-back.
- A fee response without its flag read as no fee.
- A booking outside the −30/+90-day window got a cancel `(no-op)` with exit 0.
- A benefits response without groups read as "no booking credits".
- A corrupt `token.json` read as "not connected".
- A missing unpaid count was omitted.

## Implements

- `specs/architecture.md` § Config & state: empty bodies and decision fields fail closed.
- `specs/commands/book.md`: no numeric `TotalAmount` means `UNEXPECTED_RESPONSE`, and nothing is
  committed.
- `specs/commands/bookings.md`: the out-of-window id check, the fee flag, and the cancel status with
  read-back.
- `specs/commands/credits.md`: no groups is `UNEXPECTED_RESPONSE`.

## Approach

`nexudusRequest` throws UNEXPECTED_RESPONSE on an empty body unless the caller passes `allowEmpty`
(only CreateInvoice, verified live). Each decision field is checked where it is read. Cancel requires a
numeric `Status`, and when it is missing reads the calendar back. A miss in the calendar window is
checked by id before it is called a no-op.

## Validation

- [x] Unit: an empty preview, or one without TotalAmount, never calls CreateInvoice.
- [x] Unit: a fee without its flag reads unknown; a status-less cancel with the booking still present
      is CANCEL_UNCONFIRMED; an existing out-of-window booking is OUT_OF_WINDOW.
- [x] Unit: benefits `{}` is UNEXPECTED_RESPONSE; a corrupt token.json is CONFIG_INVALID.
- [x] All 7 new tests fail against the previous source and pass with the fix; 140 tests in total.
