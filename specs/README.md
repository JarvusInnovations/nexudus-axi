# nexudus-axi specs

These specs declare the **desired state** of nexudus-axi. Implementation follows spec — the spec leads, the code conforms. Work-in-flight is tracked in [`../plans/`](../plans/); each plan names the specs it implements.

## Layout

```
specs/
├── README.md              # this file
├── principles.md          # project-wide decisive rules (the philosophy)
├── architecture.md        # stack, structure, build, config, docs generation
├── api/                   # the Nexudus member-portal API contract we consume
│   ├── conventions.md      # per-space base URL, OAuth2 token flow, headers, errors, the timezone quirk
│   ├── resources.md        # bookable resources + per-slot availability
│   ├── bookings.md         # the Booking object, price preview, create/update/cancel, my-bookings reads
│   └── coworker.md         # profile bootstrap, booking-credit benefits, contracts
├── behaviors/             # cross-cutting rules spanning multiple commands
│   ├── spaces-and-accounts.md  # multi-space credential store + active-space resolution
│   └── time-and-timezone.md    # human time in, space wall-clock out (the fake-Z quirk)
└── commands/              # one file per command surface
    ├── home.md             # no-args ambient view
    ├── auth.md             # login / status / use / logout + doctor
    ├── setup.md            # session-hook lifecycle
    ├── rooms.md            # resources: list / view / slots
    ├── credits.md          # booking-credit balances
    ├── book.md             # price-preview and create a booking
    └── bookings.md         # my bookings: list / view / cancel
```

## Conventions

- Specs declare **what** must be true, not **how** to build it.
- Every command spec lists its default TOON schema (the minimal column set), its flags, and its contextual-disclosure suggestions.
- When code and spec diverge, the spec is right and the code is a bug — fix the spec first if the spec is wrong.
- The `api/` specs are reverse-engineered from the Nexudus v4 member portal (captured live 2026-09-01 against a real space). Fields marked **unverified** were inferred and must be confirmed during implementation; confirming or correcting them is a spec update, not a code workaround.
