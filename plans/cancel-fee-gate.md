---
status: done
depends: [partial-bodies-fail-closed]
specs:
  - specs/commands/bookings.md
issues: []
pr: 32
---

# Plan: A late-cancellation fee is never incurred implicitly

## Scope

The AXI catalog pre-submission review of v0.3.5 noted that `bookings cancel` read a known non-zero
late-cancellation fee and then cancelled anyway. Catalog precedent records ungated mutations as an
exception. Chris chose to gate the case that costs money, rather than gate everything or only record
it. **In:** cancel refuses with FEE_NOT_ACCEPTED when the fee is non-zero or can't be read, unless
`--accept-fee` is passed. **Out:** a gate on `book`. It only commits credit-covered (zero-total)
bookings and has `--dry-run`, so the catalog entry records it as the remaining ungated mutation.

## Implements

- `specs/commands/bookings.md` § bookings cancel: `--accept-fee` and FEE_NOT_ACCEPTED.

## Validation

- [x] Unit: a 12.50 fee without the flag → FEE_NOT_ACCEPTED naming 12.50, and no deletejson call. With
      `--accept-fee` it cancels and reports the fee.
- [x] Unit: a fee-free cancel needs no flag; an unreadable fee needs the flag.
- [x] The gate test fails against the previous source and passes with the fix; 144 tests in total.
