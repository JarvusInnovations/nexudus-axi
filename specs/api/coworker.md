# API: Coworker Profile & Benefits

## Profile bootstrap

```
GET /en/profile?_resource=User       — portal user (login identity)
GET /en/profile?_resource=Coworker   — coworker record (member identity)
```

Captured at `auth login` time to cache the identifiers every other call needs: `CoworkerId` (bookings), coworker full name, email, and the space's `BusinessId`/`BusinessName` (**unverified** exact field paths — capture during implementation). The space's IANA timezone must also be resolved here if the payload carries it (**unverified**; fallback: a `--timezone` option on `auth login`, since wall-clock math needs it — see `specs/behaviors/time-and-timezone.md`).

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
