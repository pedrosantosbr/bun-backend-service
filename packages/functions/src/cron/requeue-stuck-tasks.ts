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
 * mid-task: any task stuck in `processing` is either re-queued (attempts
 * remaining) or marked failed (attempts exhausted). Per-task errors are
 * logged and skipped so one bad row never blocks the sweep.
 */
export const requeueStuckTasks = Effect.gen(function* () {
  const store = yield* TaskStore;
  const publisher = yield* QueuePublisher;
  const config = yield* AppConfigService;

  const stuck = yield* store.findStuckProcessing(
    new Date(Date.now() - STUCK_AFTER_MS),
    BATCH_LIMIT,
  );
  if (stuck.length === 0) return { requeued: 0, failed: 0 };

  let requeued = 0;
  let failed = 0;
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
        Effect.catchAll((error) =>
          Effect.logError("failed to requeue stuck task", {
            taskId: task.id,
            error: String(error),
          }),
        ),
      ),
    { concurrency: 5 },
  );

  yield* Effect.logInfo("requeue sweep finished", { requeued, failed });
  return { requeued, failed };
});

let runtime:
  | ManagedRuntime.ManagedRuntime<
      Effect.Effect.Context<typeof requeueStuckTasks>,
      unknown
    >
  | undefined;

/** Lambda entrypoint (see infra/cron.ts). */
export async function handler(): Promise<void> {
  runtime ??= ManagedRuntime.make(CronLayer);
  await runtime.runPromise(requeueStuckTasks);
}
