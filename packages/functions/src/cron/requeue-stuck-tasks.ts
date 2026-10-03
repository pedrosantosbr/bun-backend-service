import { TaskStore } from "@template/core/domains/tasks/store";
import { encodeTaskExecuteMessage } from "@template/core/queue/messages";
import { QueuePublisher } from "@template/core/queue/queue-publisher";
import { AppConfigService } from "@template/shared/config";
import { Effect, ManagedRuntime } from "effect";
import { CronLayer } from "../layers";

const STUCK_AFTER_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
const BATCH_LIMIT = 50;

/**
 * Safety net for the non-atomic create+enqueue and for workers that died
 * mid-task:
 * - tasks stuck in `processing` are re-queued (attempts remaining) or
 *   marked failed (attempts exhausted)
 * - stale `pending` tasks (their execute message was lost, e.g. the
 *   publish after insert failed) are simply re-enqueued — duplicates are
 *   safe because the worker's claim is idempotent.
 * Per-task errors are logged and skipped so one bad row never blocks the
 * sweep.
 */
export const requeueStuckTasks = Effect.gen(function* () {
  const store = yield* TaskStore;
  const publisher = yield* QueuePublisher;
  const config = yield* AppConfigService;
  const olderThan = new Date(Date.now() - STUCK_AFTER_MS);

  let requeued = 0;
  let failed = 0;
  let reenqueuedPending = 0;

  const stuck = yield* store.findStuckProcessing(olderThan, BATCH_LIMIT);
  yield* Effect.forEach(
    stuck,
    (task) =>
      Effect.gen(function* () {
        if (task.attemptCount >= MAX_ATTEMPTS) {
          yield* store.transition(task.id, "failed", {
            failureReason: `exceeded ${MAX_ATTEMPTS} attempts`,
          });
          failed++;
          return;
        }
        yield* store.transition(task.id, "pending");
        yield* publisher.send(config.taskQueueUrl, {
          body: encodeTaskExecuteMessage(task.id),
        });
        requeued++;
      }).pipe(
        Effect.catch((error) =>
          Effect.logError("failed to requeue stuck task", {
            taskId: task.id,
            error: String(error),
          }),
        ),
      ),
    { concurrency: 5 },
  );

  const stalePending = yield* store.findStalePending(olderThan, BATCH_LIMIT);
  yield* Effect.forEach(
    stalePending,
    (task) =>
      publisher
        .send(config.taskQueueUrl, { body: encodeTaskExecuteMessage(task.id) })
        .pipe(
          Effect.tap(() => Effect.sync(() => reenqueuedPending++)),
          Effect.catch((error) =>
            Effect.logError("failed to re-enqueue stale pending task", {
              taskId: task.id,
              error: String(error),
            }),
          ),
        ),
    { concurrency: 5 },
  );

  if (requeued + failed + reenqueuedPending > 0) {
    yield* Effect.logInfo("requeue sweep finished", {
      requeued,
      failed,
      reenqueuedPending,
    });
  }
  return { requeued, failed, reenqueuedPending };
});

let runtime:
  | ManagedRuntime.ManagedRuntime<
      Effect.Services<typeof requeueStuckTasks>,
      unknown
    >
  | undefined;

/** Lambda entrypoint (see infra/cron.ts). */
export async function handler(): Promise<void> {
  runtime ??= ManagedRuntime.make(CronLayer);
  await runtime.runPromise(requeueStuckTasks);
}
