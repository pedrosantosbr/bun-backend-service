import { AppConfigService } from "@template/shared/config";
import type {
  ConflictError,
  DatabaseQueryError,
  NotFoundError,
  QueueError,
} from "@template/shared/errors";
import { createId } from "@template/shared/ids";
import { Context, Effect, Layer } from "effect";
import { encodeTaskExecuteMessage } from "../../queue/messages";
import { QueuePublisher } from "../../queue/queue-publisher";
import type { TaskRow } from "./db/schema/tasks.sql";
import { TaskStore } from "./store";
import type { CreateTaskInput, ListTasksFilter } from "./types";

export interface TaskServiceShape {
  /**
   * Inserts the task and enqueues its execution. Insert and enqueue are not
   * atomic: if the publish fails the row stays `pending` and the effect
   * fails with QueueError — the requeue cron is the safety net. For strict
   * delivery guarantees introduce an outbox (see docs/guides).
   */
  readonly create: (
    input: CreateTaskInput,
  ) => Effect.Effect<TaskRow, DatabaseQueryError | QueueError>;
  readonly get: (
    id: string,
  ) => Effect.Effect<TaskRow, DatabaseQueryError | NotFoundError>;
  readonly list: (
    filter: ListTasksFilter,
  ) => Effect.Effect<
    { items: readonly TaskRow[]; nextCursor: string | null },
    DatabaseQueryError
  >;
  readonly cancel: (
    id: string,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError
  >;
  /** Re-enqueues a pending task, or moves a failed task back to pending first. */
  readonly requestExecution: (
    id: string,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError | QueueError
  >;
  readonly markProcessing: (
    id: string,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError
  >;
  readonly markCompleted: (
    id: string,
    result: Record<string, unknown>,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError
  >;
  readonly markFailed: (
    id: string,
    reason: string,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError
  >;
}

export class TaskService extends Context.Tag("@template/core/TaskService")<
  TaskService,
  TaskServiceShape
>() {}

export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const store = yield* TaskStore;
    const publisher = yield* QueuePublisher;
    const config = yield* AppConfigService;

    const enqueueExecution = (taskId: string) =>
      publisher
        .send(config.taskQueueUrl, { body: encodeTaskExecuteMessage(taskId) })
        .pipe(
          Effect.tap(({ messageId }) =>
            Effect.logDebug("task execution enqueued", { taskId, messageId }),
          ),
          Effect.asVoid,
        );

    return {
      create: (input) =>
        Effect.gen(function* () {
          const task = yield* store.insert({
            id: createId(),
            title: input.title,
            description: input.description ?? null,
          });
          yield* enqueueExecution(task.id);
          yield* Effect.logInfo("task.created", { taskId: task.id });
          return task;
        }),

      get: (id) => store.findById(id),

      list: (filter) => store.list(filter),

      cancel: (id) =>
        store
          .transition(id, "cancelled")
          .pipe(
            Effect.tap((task) =>
              Effect.logInfo("task.cancelled", { taskId: task.id }),
            ),
          ),

      requestExecution: (id) =>
        Effect.gen(function* () {
          const current = yield* store.findById(id);
          const task =
            current.status === "failed"
              ? yield* store.transition(id, "pending", {
                  incrementAttempts: false,
                })
              : current;
          yield* enqueueExecution(task.id);
          return task;
        }),

      markProcessing: (id) =>
        store.transition(id, "processing", {
          startedAt: new Date(),
          incrementAttempts: true,
        }),

      markCompleted: (id, result) =>
        store
          .transition(id, "completed", { result, completedAt: new Date() })
          .pipe(
            Effect.tap((task) =>
              Effect.logInfo("task.completed", { taskId: task.id }),
            ),
          ),

      markFailed: (id, reason) =>
        store
          .transition(id, "failed", { failureReason: reason })
          .pipe(
            Effect.tap((task) =>
              Effect.logWarning("task.failed", { taskId: task.id, reason }),
            ),
          ),
    } satisfies TaskServiceShape;
  }),
);
