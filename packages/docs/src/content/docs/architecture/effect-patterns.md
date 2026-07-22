---
title: Effect patterns
description: The service, layer and error conventions used everywhere.
---

## Services: interface + Context.Tag + Layer

Every capability is defined as an interface, addressed by a `Context.Tag`,
and implemented by a `Layer`:

```ts
export interface TaskStoreShape {
  readonly findById: (id: string) =>
    Effect.Effect<TaskRow, DatabaseQueryError | NotFoundError>;
}

export class TaskStore extends Context.Tag("@template/core/TaskStore")<
  TaskStore,
  TaskStoreShape
>() {}

export const TaskStoreLive = Layer.effect(
  TaskStore,
  Effect.gen(function* () {
    const { db } = yield* PostgresDatabaseService;
    return { findById: (id) => /* ... */ } satisfies TaskStoreShape;
  }),
);
```

Resources that must be released (db pools, mongo connections, SQS clients)
use `Layer.scoped` + `Effect.acquireRelease` — disposing the runtime closes
them (see `packages/core/src/db/postgres/service.ts`).

## Errors: Schema.TaggedError only

All errors are `Schema.TaggedError` subclasses defined in
`@template/shared/errors`. Never throw bare `Error`, never return `new
Error()` from an `Effect.tryPromise` catch. Recover with `catchTag`, not
`catchAll`:

```ts
tasks.markProcessing(taskId).pipe(
  Effect.catchTag("ConflictError", () => Effect.succeed(null)), // expected
  // DatabaseQueryError keeps propagating — the caller decides
);
```

House rules (inherited from platform, enforced by `lint:forbidden`):

- `Effect.tryPromise`, never `Effect.promise`
- no `Effect.either` + manual `_tag` branching
- no throwaway error types — reuse the shared ones
- decompose `Effect.gen` functions that grow past ~40 lines

## Runtimes: one ManagedRuntime per process

Layers are memoized **by instance**, so each process builds its dependency
graph exactly once:

- the API keeps a lazy singleton in `packages/api/src/lib/handle-effect.ts`
  (`getApiRuntime`, with `setApiRuntime` as the test seam)
- each Lambda keeps a container-scoped runtime
  (`makeSqsBatchHandler` in `packages/functions/src/lib/sqs.ts`)
- tests build one per suite with `setupTestRuntime(layer)` and dispose it in
  `afterAll`.

Compose dependencies with `Layer.mergeAll` / `Layer.provideMerge` once, at
the edge — avoid stacking `Effect.provide` calls inside business logic.

## Request metadata

`RequestMetadataService` carries `requestId`/`correlationId` through every
pipeline. HTTP handlers seed it from `x-request-id`/`x-correlation-id`
headers; queue handlers use the SQS message id; the base HTTP client
re-emits both headers downstream. Access is optional (`Effect.serviceOption`),
so code never fails just because metadata is missing.
