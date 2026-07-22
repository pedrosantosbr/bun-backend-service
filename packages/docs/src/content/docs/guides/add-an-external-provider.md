---
title: Add an external provider
description: The four-file pattern - interface, config, HTTP live, fake.
---

External integrations live in `packages/services` behind a `Context.Tag`
interface so the rest of the codebase never sees HTTP. Copy
`packages/services/src/echo-provider/`:

```
<provider>/
├── types.ts      # wire types + Effect Schema for response decoding
├── service.ts    # the interface + Context.Tag consumers depend on
├── config.ts     # config tag + Live (from AppConfig) + make*ConfigTest()
├── http-live.ts  # real implementation over the base HTTP client
├── fake.ts       # deterministic fake + factory with failure injection
├── layers.ts     # mode switch (http vs fake) from config
└── index.ts
```

## The interface (`service.ts`)

```ts
export interface PaymentProviderShape {
  readonly createPayout: (req: PayoutRequest) =>
    Effect.Effect<PayoutResult, ProviderError>;
}
export class PaymentProvider extends Context.Tag(
  "@template/services/PaymentProvider",
)<PaymentProvider, PaymentProviderShape>() {}
```

Errors are always `ProviderError` with a machine-readable `code` and a
`retryable` hint — callers make policy decisions (`retryable`? mark failed?
alert?) without parsing messages.

## The HTTP implementation (`http-live.ts`)

Use `makeJsonRequest` from `packages/services/src/http/base-client.ts`. It
gives you: correlation-header propagation, timeout, exponential retry on
transport/5xx errors, and status → `AppError` mapping. Then:

1. map `AppError` → `ProviderError` (`toProviderError`)
2. **decode the response with an Effect Schema** — schema drift becomes an
   explicit `INVALID_RESPONSE` error instead of bad data flowing inward.

Secrets ride in config as `Redacted.Redacted<string>` and are only
unwrapped at the request boundary (`Redacted.value(config.apiKey)`).

## The fake (`fake.ts`)

The fake is a first-class implementation, not a test hack: it powers local
dev (`ECHO_PROVIDER_MODE=fake` keeps `bun run dev` self-contained) and all
worker tests. Provide a factory with failure injection:

```ts
makeEchoProviderFake({ failWith: new ProviderError({ ... }) })
```

## Testing policy

- Unit-test the fake and any pure mapping logic.
- Integration-test `http-live` against an **in-process `Bun.serve` stub**
  (see `http-live.integration.test.ts`) — assert auth headers, retry
  behavior, error mapping and schema-drift handling. This is the only
  place stubbing is allowed: the provider is a true external boundary.
- Everything downstream (workers, routes) uses the fake layer.
