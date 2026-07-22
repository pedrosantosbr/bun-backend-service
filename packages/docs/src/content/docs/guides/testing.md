---
title: Testing
description: Integration-first testing against real docker dependencies.
---

## Philosophy

Tests are **integration-first**: real Postgres, real MongoDB, real
(Elastic)SQS — real migrations, real queries, real serialization. Mock only
true external boundaries (outbound HTTP to providers). Never mock internal
code as a shortcut; if a test needs isolation, inject a different Layer.

## Taxonomy

| Pattern | Suffix | Needs docker | Run with |
| --- | --- | --- | --- |
| unit | `*.test.ts` | no | `bun run test:unit` |
| integration | `*.integration.test.ts` | yes | `bun run test:integration` |

`bun run check` runs both (starting docker in between). `bunfig.toml`
preloads `packages/core/src/test-setup.ts`, which pins test env vars so
suites never inherit your shell.

## The harnesses (`packages/core/src/test/`)

```ts
beforeAll(async () => {
  await createTestSchema();               // drizzle push, hash-cached
  runtime = setupTestRuntime(StoreLayer); // ManagedRuntime for the suite
});
afterAll(() => runtime.dispose());        // closes pools/connections
beforeEach(async () => {
  await clearTestData();                  // TRUNCATE tpl_* ... CASCADE
  await clearMongoTestData();             // drop the test mongo db
  await purgeQueue(sqs);                  // reset ElasticMQ
});
```

- `setupTestRuntime(layer)` returns `{ runTest, dispose }`; build the layer
  from real Lives plus `makeAppConfigTest(overrides)`.
- `executeTestSql(sql, params)` exists for fixture surgery (e.g. aging a
  row's `updated_at` to test the stuck-task cron).

## Layer swapping instead of mocks

- Queue behavior in unit-ish tests: `makeFakeQueuePublisher()` records
  sent messages and can fail on demand.
- Provider behavior: `makeEchoProviderFake({ failWith })`.
- The whole API: `setApiRuntime(ManagedRuntime.make(testLayer))` swaps what
  `app.request()` executes against — the HTTP stack stays fully real.

## What to cover for a new feature

1. store: CRUD + invariants (guarded transitions, pagination) against pg/mongo
2. service: orchestration incl. failure paths (fake publisher/provider)
3. route: envelope, status codes, validation via `app.request()`
4. worker: success / business-failure / poison / redelivery via synthetic
   `SQSEvent`s.
