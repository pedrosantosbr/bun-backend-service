import { CommentStore } from "@template/core/domains/comments/store";
import { TaskService } from "@template/core/domains/tasks/task-service";
import { decodeTaskExecuteMessage } from "@template/core/queue/messages";
import { EchoProvider } from "@template/services/echo-provider/service";
import { Effect, type Layer } from "effect";
import { makeSqsBatchHandler, type SqsBatchHandler } from "../lib/sqs";
import { WorkerLayer } from "../layers";

/**
 * Executes one task: claim it (pending → processing), call the external
 * provider, then record the outcome in Postgres and the interaction trail
 * in Mongo.
 *
 * Error semantics:
 * - a task that is not claimable (already processing/cancelled/missing) is
 *   skipped — redelivered messages must be idempotent
 * - ProviderError marks the task failed and consumes the message (business
 *   failure, retrying the message would not help; `POST /:id/execute` or
 *   the requeue cron retry deliberately)
 * - infrastructure errors (Postgres down…) propagate, land the record in
 *   batchItemFailures and let SQS redeliver.
 */
export const processTaskExecution = (
  taskId: string,
): Effect.Effect<void, unknown, TaskService | CommentStore | EchoProvider> =>
  Effect.gen(function* () {
    const tasks = yield* TaskService;
    const comments = yield* CommentStore;
    const provider = yield* EchoProvider;

    const task = yield* tasks.markProcessing(taskId).pipe(
      Effect.catchTag("ConflictError", (error) =>
        Effect.logInfo("task not claimable, skipping", {
          taskId,
          reason: error.message,
        }).pipe(Effect.as(null)),
      ),
      Effect.catchTag("NotFoundError", () =>
        Effect.logWarning("task not found, skipping", { taskId }).pipe(
          Effect.as(null),
        ),
      ),
    );
    if (task === null) return;

    yield* comments
      .recordInteraction({ taskId, kind: "processing" })
      .pipe(Effect.ignore({ log: true }));

    yield* provider
      .process({ taskId, text: task.description ?? task.title })
      .pipe(
        Effect.flatMap((result) =>
          tasks.markCompleted(taskId, { ...result }).pipe(
            Effect.tap(() =>
              comments
                .recordInteraction({
                  taskId,
                  kind: "completed",
                  detail: { sentiment: result.sentiment },
                })
                .pipe(Effect.ignore({ log: true })),
            ),
          ),
        ),
        Effect.catchTag("ProviderError", (error) =>
          tasks.markFailed(taskId, `${error.code}: ${error.message}`).pipe(
            Effect.tap(() =>
              comments
                .recordInteraction({
                  taskId,
                  kind: "failed",
                  detail: { code: error.code },
                })
                .pipe(Effect.ignore({ log: true })),
            ),
          ),
        ),
        Effect.catchTag("ConflictError", (error) =>
          Effect.logWarning("task changed state mid-flight", {
            taskId,
            reason: error.message,
          }),
        ),
        Effect.asVoid,
      );
  });

export const makeTaskExecutorHandler = (
  layer: Layer.Layer<TaskService | CommentStore | EchoProvider, unknown>,
): SqsBatchHandler =>
  makeSqsBatchHandler({
    decode: decodeTaskExecuteMessage,
    layer,
    process: (message) => processTaskExecution(message.taskId),
  });

/** Lambda entrypoint (see infra/queues.ts). */
export const handler = makeTaskExecutorHandler(WorkerLayer);
