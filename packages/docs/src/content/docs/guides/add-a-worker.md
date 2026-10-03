---
title: Add a worker
description: Message schema → SQS batch handler → infra → local runs.
---

Workers are SQS-batch Lambda handlers built with `makeSqsBatchHandler`
(`packages/functions/src/lib/sqs.ts`). The task executor
(`workers/task-executor.ts`) is the reference implementation.

## 1. Define the message contract

In `packages/core/src/queue/messages.ts`, with Effect Schema so producer
and consumer share one definition:

```ts
export const InvoiceIssueMessage = Schema.Struct({
  type: Schema.Literal("invoice.issue"),
  invoiceId: Schema.String.check(Schema.isUUID()),
});
export const decodeInvoiceIssueMessage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(InvoiceIssueMessage),
);
```

## 2. Write the handler

```ts
export const handler = makeSqsBatchHandler({
  decode: decodeInvoiceIssueMessage,
  layer: WorkerLayer,
  process: (message) => processInvoice(message.invoiceId),
});
```

Semantics you get for free:

- **Lazy container runtime** — the layer graph is built once per Lambda
  container, not per invocation.
- **Partial batch failure** — a record whose effect fails lands in
  `batchItemFailures`; SQS redelivers only that record.
- **Poison messages** — bodies that fail to decode are logged and dropped
  (retrying cannot fix them).

Design `process` for **idempotent redelivery**: claim work with a guarded
state transition and treat "already claimed" as success, the way
`processTaskExecution` catches `ConflictError`.

Distinguish error classes deliberately:

- business failure (provider rejected) → record the failure, consume the
  message
- infrastructure failure (db down) → let it propagate so SQS retries.

## 3. Wire the queue in infra

In `infra/queues.ts`:

```ts
queue.subscribe(
  {
    handler: "packages/functions/src/workers/invoice-issuer.handler",
    runtime: "nodejs22.x",
    environment: runtimeEnvironment,
  },
  { batch: { size: 10, partialResponses: true } },
);
```

`partialResponses: true` is required — without it SQS ignores
`batchItemFailures` and retries whole batches.

For local dev, add the queue to `elasticmq.conf` (with a DLQ + redrive) and
extend `scripts/local-worker.ts` or copy it — the poller feeds real queue
messages through the exact production handler.

## 4. Test it

See `workers/task-executor.integration.test.ts`: build the handler with a
test layer (`makeTaskExecutorHandler(testLayer)`), feed it synthetic events
from `makeSqsEvent`, and assert on database state plus
`batchItemFailures`. Cover: success, business failure, poison message,
redelivery.
