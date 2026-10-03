import {
  ConflictError,
  DatabaseQueryError,
  NotFoundError,
} from "@template/shared/errors";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { PostgresDatabaseService, runQuery } from "../../db/postgres/service";
import { tasks, type NewTaskRow, type TaskRow } from "./db/schema/tasks.sql";
import {
  transitionSources,
  type ListTasksFilter,
  type TaskStatus,
} from "./types";

export interface TransitionPatch {
  readonly result?: Record<string, unknown>;
  readonly failureReason?: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly incrementAttempts?: boolean;
}

export interface TaskStoreShape {
  readonly insert: (
    row: NewTaskRow,
  ) => Effect.Effect<TaskRow, DatabaseQueryError>;
  readonly findById: (
    id: string,
  ) => Effect.Effect<TaskRow, DatabaseQueryError | NotFoundError>;
  readonly list: (
    filter: ListTasksFilter,
  ) => Effect.Effect<
    { items: readonly TaskRow[]; nextCursor: string | null },
    DatabaseQueryError
  >;
  /**
   * Atomically moves a task to `to`, but only when its current status is a
   * legal source for that transition (UPDATE ... WHERE status IN (...)).
   * Fails with ConflictError when the task exists in a different status.
   */
  readonly transition: (
    id: string,
    to: TaskStatus,
    patch?: TransitionPatch,
  ) => Effect.Effect<
    TaskRow,
    DatabaseQueryError | NotFoundError | ConflictError
  >;
  readonly findStuckProcessing: (
    olderThan: Date,
    limit: number,
  ) => Effect.Effect<readonly TaskRow[], DatabaseQueryError>;
  /** Pending tasks nobody has touched in a while — their execute message
   * was lost (publish failure, queue purge). They only need re-enqueueing. */
  readonly findStalePending: (
    olderThan: Date,
    limit: number,
  ) => Effect.Effect<readonly TaskRow[], DatabaseQueryError>;
}

export class TaskStore extends Context.Service<TaskStore, TaskStoreShape>()(
  "@template/core/TaskStore",
) {}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const TaskStoreLive = Layer.effect(
  TaskStore,
  Effect.gen(function* () {
    const { db } = yield* PostgresDatabaseService;

    const findById: TaskStoreShape["findById"] = (id) =>
      runQuery("TaskStore.findById", () =>
        db.select().from(tasks).where(eq(tasks.id, id)).limit(1),
      ).pipe(
        Effect.flatMap((rows) =>
          rows[0]
            ? Effect.succeed(rows[0])
            : Effect.fail(new NotFoundError({ resource: "task", id })),
        ),
      );

    return {
      insert: (row) =>
        runQuery("TaskStore.insert", () =>
          db.insert(tasks).values(row).returning(),
        ).pipe(
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed(rows[0])
              : Effect.fail(
                  new DatabaseQueryError({
                    message: "insert returned no row",
                    operation: "TaskStore.insert",
                  }),
                ),
          ),
        ),

      findById,

      list: ({ status, limit = DEFAULT_PAGE_SIZE, cursor }) => {
        const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
        const conditions = [
          status ? eq(tasks.status, status) : undefined,
          cursor ? gt(tasks.id, cursor) : undefined,
        ].filter((c) => c !== undefined);
        return runQuery("TaskStore.list", () =>
          db
            .select()
            .from(tasks)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(asc(tasks.id))
            .limit(pageSize + 1),
        ).pipe(
          Effect.map((rows) => {
            const items = rows.slice(0, pageSize);
            const nextCursor =
              rows.length > pageSize ? (items.at(-1)?.id ?? null) : null;
            return { items, nextCursor };
          }),
        );
      },

      transition: (id, to, patch = {}) =>
        Effect.gen(function* () {
          const sources = transitionSources[to];
          const updated = yield* runQuery("TaskStore.transition", () =>
            db
              .update(tasks)
              .set({
                status: to,
                updatedAt: new Date(),
                ...(patch.result !== undefined ? { result: patch.result } : {}),
                ...(patch.failureReason !== undefined
                  ? { failureReason: patch.failureReason }
                  : {}),
                ...(patch.startedAt !== undefined
                  ? { startedAt: patch.startedAt }
                  : {}),
                ...(patch.completedAt !== undefined
                  ? { completedAt: patch.completedAt }
                  : {}),
                ...(patch.incrementAttempts
                  ? { attemptCount: sql`${tasks.attemptCount} + 1` }
                  : {}),
              })
              .where(and(eq(tasks.id, id), inArray(tasks.status, [...sources])))
              .returning(),
          );
          if (updated[0]) return updated[0];
          const current = yield* findById(id);
          return yield* new ConflictError({
            message: `task ${id} cannot transition from '${current.status}' to '${to}'`,
            details: { taskId: id, from: current.status, to },
          });
        }),

      findStuckProcessing: (olderThan, limit) =>
        runQuery("TaskStore.findStuckProcessing", () =>
          db
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.status, "processing"),
                lt(tasks.updatedAt, olderThan),
              ),
            )
            .orderBy(asc(tasks.updatedAt))
            .limit(limit),
        ),

      findStalePending: (olderThan, limit) =>
        runQuery("TaskStore.findStalePending", () =>
          db
            .select()
            .from(tasks)
            .where(
              and(eq(tasks.status, "pending"), lt(tasks.updatedAt, olderThan)),
            )
            .orderBy(asc(tasks.updatedAt))
            .limit(limit),
        ),
    } satisfies TaskStoreShape;
  }),
);
