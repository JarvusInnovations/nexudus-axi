# API: Resources & Availability

## List bookable resources

```
GET /en/publicresources?_depth=3
```

Response: `{ ResourceTypes, SelectedResourceType, Group, AllShifts, Resources[], NetworkResources, CustomFields }`.

Each `Resources[]` entry (at `_depth=3`) carries:

- **Identity:** `Id` (numeric), `UniqueId` (GUID — required for availability), `Name`, `ResourceTypeName`, `ResourceType`, `GroupName`, `DisplayOrder`, `Visible`
- **Business:** `BusinessId`, `BusinessName`, `BusinessAddress`
- **Description:** `Description` (HTML, frequently bloated with editor inline styles — strip to text for output)
- **Capacity/amenities:** `Allocation` (seat count), boolean amenity flags (`Internet`, `NaturalLight`, `WhiteBoard`, `LargeDisplay`, `AirConditioning`, `Heating`, `Projector`, `VideoConferencing`, …)
- **Booking rules:** `Price`, `PriceFormatted`, `MinBookingLength`, `MaxBookingLength`, `BookInAdvanceLimit`, `LateBookingLimit`, `LateCancellationLimit`, `IntervalLimit`, `AllowMultipleBookings`, `RequiresConfirmation`, `NoReturnPolicy*`, `RepeatBooking*`
- **Point-in-time state:** `IsAvailable`, `AvailableUnits`, `Message`, `ErrorCode`

`_depth=1` returns stub `{}` objects — never use it for resource reads.

**Caveat:** `IsAvailable`/`AvailableUnits` reflect the server's default window, and are **not** driven by `From`/`To` query params (verified live: identical results for disjoint windows). Per-window availability must come from the slots endpoint below.

## Per-slot availability

```
GET /en/bookings/GetAvailabilityAtWithUser?days={n}&guid={resource UniqueId}&startTime={YYYY-MM-DD}&interval={minutes}
```

- The portal uses `interval=30` and `days=1`.
- Response: `{ Resource: {Id, Name, NoReturnPolicy*, IntervalLimit}, AvailableSlots: [{ DateTime, Date, Time, Available, AllowMultipleBookings, Capacity, BookedCount, BookedDesks, Booked }] }`
- `DateTime` is space wall-clock (`2026-09-01T14:00`, no zone suffix here).
- A companion `GET /en/bookings/GetAvailabilityAt` exists for anonymous callers (**unverified** — portal client branches on having a customer); the tool always uses the `WithUser` variant.

## Resource products & custom booking fields

```
GET /en/bookings/getResourceProducts?resourceId={Id}&bookingId={Id|undefined}
GET /en/bookings/getBookingFormCustomFields?resourceId={Id}
```

Add-on products and per-resource custom form fields. v1 reads them only to warn when a resource demands required custom fields (**unverified** shape).
