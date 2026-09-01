# API: Conventions

The Nexudus member-portal API, as consumed by the v4 member portal (`v4_portal` Next.js app). Reverse-engineered from live traffic 2026-09-01; no official documentation covers this surface.

## Base URL

Every space is a tenant at its own host:

```
https://{space}.spaces.nexudus.com
```

`{space}` is the Nexudus subdomain slug (e.g. `acme`). A space may also front the portal on a custom domain (e.g. `members.acme.example`), but that domain serves only the static portal shell — **all API calls target the `spaces.nexudus.com` host**, which is what the tool stores and uses.

Two endpoint families:

- `/en/...` — portal endpoints (the bulk of the surface). `en` is a culture segment; the tool always uses `en`.
- `/api/public/...` — shaped public-API endpoints the portal also calls.

## Auth: OAuth2 password + refresh grants

```
POST {base}/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={email}&password={password}&totp={totp-or-empty}
grant_type=refresh_token&refresh_token={refresh_token}
```

- Response carries an access token and a refresh token (**unverified**: exact field names — portal code reads `AccessToken` in one path; standard OAuth `access_token` in another; capture the real body during implementation and update this spec).
- Every subsequent request sends `Authorization: Bearer {access_token}`.
- On 401, refresh once with the stored refresh token and retry; if the refresh fails, fail with a structured error directing to `auth login`.
- TOTP: accounts with 2FA pass the code in the `totp` field of the password grant.
- Browser CORS restricts `/api/token` to portal origins; server-side callers (this tool) are unaffected.

## Required headers

| Header | Value | Notes |
| --- | --- | --- |
| `Authorization` | `Bearer {token}` | all authenticated calls |
| `Accept` | `application/json` | `/en/*` endpoints content-negotiate; without this some return HTML |
| `Content-Type` | `application/json` | JSON writes (`/api/token` uses form encoding) |
| `nx-app-version` | portal version (e.g. `4.0.805`) | sent on every portal call; sent for fidelity with observed traffic |
| `User-Agent` | `nexudus-axi/{version}` | identify ourselves honestly |

## The `_depth` and `_shape` query conventions

- `_depth=N` — how deeply nested objects are populated. `_depth=1` returns stub objects (`{}`); resource reads need `_depth=3`.
- `_shape=A.B,A.C,...` — field projection for `/api/public/*` endpoints; response contains only the named paths.
- `_resource=X` — selects a sub-resource view on some `/en/*` endpoints (e.g. `/en/profile?_resource=Coworker`).

## Timezone quirk (load-bearing)

All datetime fields — request and response — are the **space's local wall-clock time serialized with a literal `Z` suffix**. `2026-09-01T14:00:00.000Z` means *2:00 PM at the space*, not 14:00 UTC. See `specs/behaviors/time-and-timezone.md` for the handling rule.

## Entity envelope

Nexudus entities share base fields: `Id` (numeric), `UniqueId` (GUID), `CreatedOn`/`UpdatedOn` (+`...Utc` variants), `IsNull`. The GUID `UniqueId` is required by some endpoints (availability) where others take the numeric `Id` — both are captured in reads so the agent never has to fetch one to use the other.

## Errors

- Portal endpoints generally return HTTP 200 with `{WasSuccessful: false, Message, Errors}` envelopes on business-rule failures (**unverified** exact shape — capture during implementation), and plain HTTP errors (401/403/404/500) otherwise.
- 401 → token expired/invalid (trigger refresh-and-retry, once).
- HTML bodies can come back from unauthenticated or content-negotiation misses; the client must never surface raw HTML — translate to a structured error.
