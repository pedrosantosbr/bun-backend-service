---
title: Add a cron / script function
description: Scheduled Lambdas and one-off operational scripts.
---

## Scheduled Lambda

A cron handler is a no-argument Lambda running one Effect program.
`packages/functions/src/cron/requeue-stuck-tasks.ts` is the reference:

```ts
export const sweepExpiredThings = Effect.gen(function* () {
  const store = yield* SomeStore;
  const expired = yield* store.findExpired(new Date());
  yield* Effect.forEach(expired, handleOne, { concurrency: 5 });
  return { swept: expired.length };
});

let runtime: ManagedRuntime.ManagedRuntime<...> | undefined;
export async function handler(): Promise<void> {
  runtime ??= ManagedRuntime.make(CronLayer);
  await runtime.runPromise(sweepExpiredThings);
}
```

Conventions:

- Export the **program** separately from the handler — tests run the
  program on a test runtime and never touch the Lambda wrapper.
- Per-item failures are caught and logged inside the loop so one bad row
  never aborts the sweep.
- Keep the layer minimal (`CronLayer` skips Mongo and the provider).

Schedule it in `infra/cron.ts`:

```ts
new sst.aws.Cron("SweepExpired", {
  schedule: "rate(1 hour)",
  function: {
    handler: "packages/functions/src/cron/sweep-expired.handler",
    runtime: "nodejs22.x",
    environment: runtimeEnvironment,
  },
});
```

## One-off scripts

Operational scripts live in `scripts/` at the repo root and run with
`bun run scripts/<name>.ts`. They may import any workspace package (the
local worker poller, `scripts/local-worker.ts`, is the example). For
anything touching production data, prefer promoting the logic into a
maintenance Lambda so it runs with linked resources and an audit trail.
