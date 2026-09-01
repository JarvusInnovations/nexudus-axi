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

## Write endpoints

```
POST /en/bookings/newBookingJson        body: Booking   — create   (portal client: saveBookingToCreate)
POST /en/bookings/bookingJson           body: Booking   — update   (portal client: saveBookingToUpdate)
POST /en/bookings/deletejson/{id}       body: (unverified) — cancel (portal client: cancelBooking)
```

Response shapes **unverified** — capture during implementation (expect a `WasSuccessful`/`Message` envelope and/or the saved booking). Paid bookings not covered by credits may require the basket checkout flow (`POST /en/basket/CreateInvoice`, `POST /en/basket/PostItems`) — v1 targets credit/zero-value bookings via `newBookingJson` with `ChargeNow: true` and must surface a structured error, not a silent misbook, if the API refuses an uncovered paid booking.

## Reading my bookings

```
GET /en/bookings/fullCalendarBookings?{query}    — my bookings for a window (portal's calendar feed; query params unverified — likely start/end)
GET /en/bookings/BookingJson/{id}                — single booking detail
GET /en/bookings/getUnpaidBookings               — bookings awaiting payment
GET /en/bookings/getCancellationFee?bookingId={id}
```

`getCancellationFee` is checked before cancel so the tool can state the fee (late-cancellation policy) in the cancel output.
