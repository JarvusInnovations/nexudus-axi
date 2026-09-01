# API: Coworker Profile & Benefits

## Profile bootstrap

```
GET /en/profile?_resource=User       — portal user (login identity)
GET /en/profile?_resource=Coworker   — coworker record (member identity)
GET /en/business/all?_depth=1&includeRoot=true — the space's businesses (Id, Name, ...)
```

Captured at `auth login` time to cache the identifiers every other call needs (field paths verified live 2026-09-01):

- `User` → `{ FullName, Email, CoworkerId, Id, ... }` — `CoworkerId` is the booking identity.
- `Coworker` → `{ Id, FullName, Email, HomeSpaceId, InvoicingBusinessId, SimpleTimeZoneId, CanMakeBookings, CanBookForTeam, ... }` (~179 fields; `Coworker.Id` equals `User.CoworkerId`).
- Business name: the `/en/business/all` row whose `Id` matches `Coworker.HomeSpaceId` (fallback: `InvoicingBusinessId`, then the first row).

**The API exposes no IANA timezone** — `SimpleTimeZoneId` is a numeric reference with no public mapping. The space's zone therefore comes from `auth login --timezone <iana>`; when unset, wall-clock math falls back to the machine zone and `doctor` flags it (see `specs/behaviors/time-and-timezone.md`).

## Booking credits & benefits

```
GET /api/public/coworkers/profiles/current/benefits?_shape=Personal.BookingCredits.{Id,Name,TotalCredit,RemainingCredit,ExpireDate,CaneBeUsedForBookings,Business.Currency.Code},Personal.ExtraServices...,Personal.TimePasses...,Team.BookingCredits...,Team.ExtraServices...,Team.TimePasses...
```

Returns `Personal` and `Team` benefit groups, each with:

- `BookingCredits[]` — `Name`, `TotalCredit`, `RemainingCredit`, `ExpireDate`, `CaneBeUsedForBookings` (sic — the API misspells it; keep verbatim)
- `ExtraServices[]` — service allowances (printing etc.)
- `TimePasses[]` — day-pass style allowances

The credits read backs both the `credits` command and the cost line in `book` output.

## Contracts

```
GET /api/public/billing/coworkerContracts?_shape=Contracts.Id,Contracts.StartDate,Contracts.InPausedPeriod,Contracts.RenewalDate,Contracts.Tariff.Name
```

Membership/tariff context — surfaced by `auth status` (plan name, renewal) rather than a dedicated command.
