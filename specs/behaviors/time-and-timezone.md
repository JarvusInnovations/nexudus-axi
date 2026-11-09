# Behavior: Time & Timezone

## Rule

The Nexudus API speaks the **space's local wall-clock**, serialized with a misleading literal `Z`. The tool treats all API datetimes as opaque wall-clock values in the space's timezone — it never converts them through UTC or the local machine's zone. Range semantics follow the family contract established in gws-axi: half-open windows, per-edge precision expansion, deterministic tokens, loud validation.

## Applies To

`rooms slots`, `book`, `bookings` (all reads and writes carrying `FromTime`/`ToTime`/slot times), and any output rendering an API datetime.

## Details

### Wall-clock discipline (the fake-Z quirk)

- API datetimes (`2026-09-01T14:00:00.000Z`) mean *that wall-clock time at the space*, not UTC. They cross the boundary verbatim as strings; any implementer reaching for `Date.toISOString()` on a booking time is writing a bug.
- **The bug is silent and expensive.** Sending an offset-bearing value (`...T15:00:00-04:00`, which is what serializing a `Date` produces) makes the server normalize to UTC and store *that* as the wall clock — the booking lands hours away, with an HTTP 200 and no error. Verified live; see [api/bookings § datetime format](../api/bookings.md#datetime-format-is-load-bearing--an-offset-bearing-value-silently-shifts-the-booking). Because it cannot be detected at send time, every write reads the stored value back and compares.
- "Today"/"tomorrow"/date arithmetic resolve on the **space's** calendar (via `Intl` with the cached IANA zone), not the machine's.
- Output renders wall-clock values plainly (`2026-09-01 14:00`) with the space named in the header — no `Z`, no offset; showing a zone marker on a value not in that zone would be a lie.

### Date and time input forms

- `--date <when>`: `YYYY-MM-DD`, or the tokens `today`, `tomorrow`, `yesterday`, `±Nd`, `±Nw` — day precision, resolved on the space's calendar. **No weekday names** (`friday` has no non-guessing resolution; explicit `next-*` spellings can land later if needed).
- `--from <time>` / `--to <time>`: `HH:MM`, `H[:MM]am/pm` (`2pm`, `9:30am`); `--to` alternatively a duration `+Nh`/`+Nm` relative to `--from`.
- Local-calendar arithmetic uses date-component overflow (never `+ n * 86_400_000`) so month/year rollover and DST are correct by construction.

### Windows are half-open and validated

- A booking/query window is `[from, to)` — matching what the API's slot grid implies (a 2:00–3:00 booking frees the 3:00 slot).
- Where a command takes a date-only *range* edge (e.g. a future `bookings --from/--to`), a date-only value on the upper edge expands to the *next* space-midnight so `--from D --to D` means all of day D.
- Resolved `from >= to` → `VALIDATION_ERROR` echoing both resolved boundaries and the flags that produced them — never an empty result. Cross-midnight windows are rejected in v1 (`--from 11pm --to +2h` names the constraint).
- Conflicting window flags (a shortcut plus explicit edges) → `VALIDATION_ERROR` naming both.

### Echo the resolved window

Every command that applied a window echoes it in the output header (`date:`, `from:`/`to:` or `window:`, plus `timezone:`) so a wrong resolution is visible, not silent.

### Booking-rule validation

Window lengths violating a resource's `MinBookingLength`/`MaxBookingLength` fail fast naming the limit — pre-flight only when the resource metadata is already in hand; otherwise let the API refuse and translate its error.

### Space timezone

The IANA zone is cached at `auth login` (see `specs/api/coworker.md`); when the API doesn't expose it, `auth login --timezone <iana>` sets it explicitly and `doctor` flags a missing timezone.

## Principles

**Inherited** — [Local wall-clock in, local wall-clock out](../principles.md#local-wall-clock-in-local-wall-clock-out--never-help-with-utc) — this behavior is that principle operationalized; the agent never computes an ISO timestamp.

**Local:**

- **Deterministic beats convenient.** A token that requires guessing intent (weekday names, "next week") doesn't ship; a token that resolves one way every time (`tomorrow`, `+2d`) does. Adopted from the gws-axi range-semantics cleanup — keep these two tools' time grammars aligned so agents transfer habits between them.
