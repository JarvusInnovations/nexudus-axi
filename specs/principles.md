# Principles

The project's philosophy, written down as decisive rules. Each picks a side of a real trade-off so an implementer can resolve an unspecified case the way the author would. Distilled from the [AXI principles](https://axi.md) and the patterns proven in [calendly-axi](https://github.com/JarvusInnovations/calendly-axi), [harvest-axi](https://github.com/JarvusInnovations/harvest-axi), and [slack-axi](https://github.com/JarvusInnovations/slack-axi).

## The booking loop is the center of gravity

The reason nexudus-axi exists is the loop an agent runs on a member's behalf: **what rooms exist → when are they free → what will it cost me → book it → manage what I've booked**. Resource metadata, credit balances, and profile data exist to support that loop. When a design choice trades booking-loop ergonomics against anything else — schema defaults, home-view content, suggestion ordering — favor the loop. The home view answers "what do I have booked and what could I book"; the flagship suggestions are "check slots" and "book it."

## We wrap the member portal, not the admin platform
>
> Nexudus has a large operator-facing admin API (`spaces.nexudus.com/api/*` with admin credentials). A member's portal session can read a slice of it, but the tool's user is a *member* of a space, not its operator.

nexudus-axi speaks the **member portal API** (`/en/*` + the `/api/public/*` endpoints the portal itself uses) with a member's own credentials. Capabilities the portal doesn't grant members — editing resources, seeing other members' bookings, operator reports — are out of scope, and errors from reaching for them say so rather than suggesting credential escalation.

## A space is a tenant; never guess which one
>
> Every Nexudus space lives at its own subdomain (`{space}.spaces.nexudus.com`) with its own token, resources, and credit economy. A booking fired at the wrong space is a real-world reservation in the wrong building.

Credentials are stored **per space**, slack-axi style. Resolution order: env → `--space` flag → configured default → the single stored space → structured error listing the options. Mutations with 2+ stored spaces require an explicit space. Output always names the space it acted on.

## Local wall-clock in, local wall-clock out — never "help" with UTC
>
> The Nexudus portal API sends and receives times as the space's **local wall-clock stamped with a literal `Z`** (2:00 PM Philadelphia is `T14:00:00.000Z`). Treating those as real UTC instants and converting silently corrupts every time by the UTC offset — a booking lands hours off.

All times cross the API boundary verbatim as wall-clock strings. The tool never converts to or from the agent's or machine's timezone. Human inputs (`--date tomorrow`, `--at 2pm`) resolve against the **space's** local calendar, and output timestamps are presented as the space's wall time, labeled as such. Any implementer reaching for `Date.toISOString()` on a booking time is writing a bug.

## Preview before commit, but never prompt
>
> A booking spends real money or real credits the moment it lands, yet AXI forbids interactive confirmation — the agent's harness owns consent.

`book` prices first and commits second in one invocation: it always runs the price preview, and its output always states what was (or would be) spent — dollars, credits, or both. `book --dry-run` stops after the preview and reports cost + availability without committing. Cost visibility is not optional output; a successful booking that didn't say what it cost is nonconforming.

## Idempotent, non-interactive mutations

Every write completes with flags alone — never prompt. Cancelling an already-cancelled booking is a no-op with exit 0, not an error. Reserve non-zero exits for intents that genuinely cannot be satisfied.

## Translate errors; never leak raw API noise

Nexudus error bodies (and its occasional HTML error pages) get translated into structured AXI errors on stdout with an actionable suggestion referencing a `nexudus-axi` command — never a raw JSON dump, HTML fragment, or stack trace. Auth failures distinguish "token expired, refresh failed — run `auth login`" from "this space rejected the request."

## Output speaks the user's domain, never the repo's
>
> A `NOT_IMPLEMENTED` stub once pointed users at `plans/rooms-read.md` — meaningful only to someone standing inside this repository.

Everything the CLI prints — help, errors, suggestions, stub notices — is written for someone using the tool, not developing it. Repo internals (plan files, spec paths, branch names) never appear in output; an unimplemented surface says it's coming in a future release and suggests what works today. The one exception: `doctor` may reference `specs/` when diagnosing portal-contract drift, since its audience at that moment *is* a developer.

## Reverse-engineered surface, spec'd honestly
>
> This API is undocumented; every contract here was captured from live portal traffic. Endpoints can shift under a portal update.

The `api/` specs are the single source of truth for what we believe the API does, including what's **unverified**. When the live API contradicts a spec, the fix starts in the spec. The client sends the portal's `nx-app-version` header and `doctor` verifies the core read path, so a portal-side contract break surfaces as a diagnosable failure, not silent corruption.
