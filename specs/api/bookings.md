# API: Bookings

## The Booking object

The shape sent to price, preview, and write endpoints (captured live from the portal):

```json
{
  "Id": 0,
  "ResourceId": 100000001,
  "FromTime": "2026-09-01T14:00:00.000Z",
  "ToTime": "2026-09-01T16:00:00.000Z",
  "CoworkerId": 100000002,
  "ChargeNow": true,
  "BookingVisitors": [],
  "BookingProducts": [],
  "CustomFields": { "Data": [] },
  "UniqueId": "<client-generated GUID v4>"
}
```

- `Id: 0` means new; updates carry the real `Id`.
- `FromTime`/`ToTime` are space wall-clock with a literal `Z` (see `specs/behaviors/time-and-timezone.md`).
- `CoworkerId` is the caller's coworker id from the profile bootstrap (`specs/api/coworker.md`).
- `UniqueId` is generated client-side and correlates basket/invoice lines back to the booking.

## Price preview (no commit)

```
POST /en/bookings/getbookingprice          body: Booking        → availability + price (portal treats fetch failure as {IsAvailable:false})
POST /en/basket/PreviewInvoice?createZeroValueInvoice=true&_shape=...   body: [{"Type":"booking","Booking":{...}}]
```

`PreviewInvoice` response (shaped): `{ Id, Currency{Code,Format}, UsedExtraServices[], UsedBookingCredits[{Amount, ExpiresOn, UnitPrice, UnitCreditPrice}], TotalAmount, TaxAmount, LinesRaw[{BookingUniqueId, UnitPrice, SubTotal, TaxAmount, Description, DiscountCode, DiscountAmount}], Errors, Message, WasSuccessful, Status }`

Credits appear as negative `LinesRaw` offsets; a fully-credit-covered booking shows `TotalAmount: 0.00` with `UsedBookingCredits` stating how many credits it consumed. **This is the cost answer `book` must surface.**

## Datetime format is load-bearing — an offset-bearing value silently shifts the booking
>
> Verified live 2026-09-02 against the member portal.

`FromTime`/`ToTime` must be sent as **bare space wall-clock**, with either the fake `Z` suffix
(`2026-09-05T14:00:00.000Z`) or no suffix at all (`2026-09-05T14:00:00`) — both are stored verbatim.

**Sending a real UTC offset moves the booking, silently.** `2026-09-05T15:00:00-04:00` is normalized to
UTC and the *converted* value is then stored as the wall clock: the booking lands at **19:00**, four hours
late, with an HTTP 200 and no error of any kind.

This is best understood as a **client-side footgun, not a server defect** — the API's contract is
"wall-clock in, wall-clock out", and an offset-bearing value violates it; the server then does something
defensible with input it never promised to accept. It is very likely the explanation for third-party
reports of "the Nexudus booking endpoint screws up timezones": any client that serializes a local time
through `Date.toISOString()`, or otherwise emits an offset, will book at the wrong hour and blame the API.
Hence `toApiWallclock` builds the string by hand, and nothing in the tool may pass a `Date`-derived or
offset-formatted value into a booking payload.

Two negative results from the same probe, worth recording so they aren't re-investigated: the
`X-Use-Timezone` header (accepted by CORS) has **no effect** on booking storage, and the fake-Z round-trip
is stable at midnight boundaries and across the US DST fall-back ambiguous hour (2026-11-01T01:00).

Blame aside, the failure mode is silent and only observable after the write — so writes must **read the
stored time back and compare**, which also covers divergences we haven't characterized. See
[commands/book § confirmed times](../commands/book.md).

## Write endpoints (verified live 2026-09-01)

```
POST /en/basket/CreateInvoice?createZeroValueInvoice=true   body: [{"Type":"booking","Booking":{...}}]   — CREATE (the member commit)
POST /en/bookings/deletejson/{id}                           body: {}                                     — CANCEL
```

- **`newBookingJson`/`bookingJson` are NOT the member path** — they return an `Access Denied` envelope for member credentials (they're the staff/admin save). The member portal commits through the basket: `CreateInvoice` books the item(s) and creates the (zero-value, when credit-covered) invoice.
- **`PostItems` also commits** — it is not an add-to-cart; the portal's basket is client-side state. The tool uses `CreateInvoice` only; calling both double-books.
- **Success is an empty 200 body.** The booking id is not returned — recover it by refetching the calendar feed and matching resource + window.
- Business-rule failures come as **HTTP 200 with an envelope**: `{Status: 500, Message, Errors[]}` — e.g. `"This resource is already booked..."` with `Errors[0].Message` carrying JSON naming the `ConflictingUniqueId`. Treat `Status >= 400` in a 200 body as the real outcome.
- `deletejson/{id}` with an empty JSON body returns `{Status: 200, Message: ""}` on success; cancelling restores credit-covered value per the space's policy.
- `getbookingprice` returns an **empty 200** — useless; `PreviewInvoice` is the sole cost source.

## Reading my bookings

```
GET /en/bookings/fullCalendarBookings?start=YYYY-MM-DD&end=YYYY-MM-DD
GET /en/bookings/BookingJson/{id}                — single booking detail
GET /en/bookings/getUnpaidBookings               — returns COUNTS: {BookingsToPay, TimeToPay} — not a list
GET /en/bookings/getCancellationFee?bookingId={id}
```

`BookingJson/{id}` (verified live): `{ Value: {Id, ResourceId, ResourceName, FromTime, ToTime, Tentative, Invoiced, Notes, CoworkerId, ChargeNow, DiscountCode, Repeat*, ...}, Resource: {Id, Name, ...} }` — note `Value.FromTime`/`ToTime` are wall-clock **without** any zone suffix here (`2026-09-02T22:00:00`).

`getCancellationFee` (verified live): `{ hasCancellationFee: boolean, cancellationFee: number | null }`.

`fullCalendarBookings` (verified live 2026-09-01):

- `start`/`end` date params are **required** — omitting either returns HTTP 500.
- Returns a bare array of camelCase rows for **every member's bookings** on the space: `{id, resourceId, resourceName, resourceTypeName, title, start, end, allDay, coworkerId, coworkerEmail, coworkerFullName, editable, tentative, invoiced, private, ignoreTimezone, ...}`.
- Other members' rows are anonymized (`private: true`, empty name/email, `editable: false`); the caller's own rows carry their `coworkerId` — **as a STRING** (`"100000002"`), unlike the numeric ids everywhere else. **The tool filters to the cached coworker id with a string-tolerant compare.**
- Times are space wall-clock with a literal `Z` (`2026-07-31T09:00Z`) and the rows carry `ignoreTimezone: true` — the API's own confirmation of the fake-Z convention.
- The window is loosely honored server-side (adjacent-day rows can appear) — filter client-side.

`getCancellationFee` is checked before cancel so the tool can state the fee (late-cancellation policy) in the cancel output.
