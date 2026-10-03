import { CommentStore } from "@template/core/domains/comments/store";
import { TaskService } from "@template/core/domains/tasks/task-service";
import { Effect } from "effect";
import { Hono } from "hono";
import { handleEffect } from "../lib/handle-effect";
import { validateBody, validateParams, validateQuery } from "../lib/validate";
import {
  CreateTaskBody,
  ListTasksQuery,
  serializeTask,
  TaskIdParams,
} from "../schemas/tasks";

export const tasksRoutes = new Hono()
  .post(
    "/",
    handleEffect(
      (c) =>
        Effect.gen(function* () {
          const body = yield* validateBody(c, CreateTaskBody);
          const service = yield* TaskService;
          const comments = yield* CommentStore;
          const task = yield* service.create(body);
          yield* comments
            .recordInteraction({ taskId: task.id, kind: "created" })
            .pipe(Effect.ignore({ log: true }));
          return serializeTask(task);
        }),
      { successStatus: 201 },
    ),
  )
  .get(
    "/",
    handleEffect((c) =>
      Effect.gen(function* () {
        const query = yield* validateQuery(c, ListTasksQuery);
        const service = yield* TaskService;
        const { items, nextCursor } = yield* service.list(query);
        return { items: items.map(serializeTask), nextCursor };
      }),
    ),
  )
  .get(
    "/:id",
    handleEffect((c) =>
      Effect.gen(function* () {
        const { id } = yield* validateParams(c, TaskIdParams);
        const service = yield* TaskService;
        const comments = yield* CommentStore;
        // Polyglot read: the Postgres row and the Mongo comments are
        // fetched concurrently and composed here, not in the stores.
        const result = yield* Effect.all(
          {
            task: service.get(id),
            comments: comments.listByTaskId(id, { limit: 20 }),
          },
          { concurrency: 2 },
        );
        return {
          ...serializeTask(result.task),
          comments: result.comments,
        };
      }),
    ),
  )
  .post(
    "/:id/execute",
    handleEffect(
      (c) =>
        Effect.gen(function* () {
          const { id } = yield* validateParams(c, TaskIdParams);
          const service = yield* TaskService;
          const task = yield* service.requestExecution(id);
          return serializeTask(task);
        }),
      { successStatus: 202 },
    ),
  )
  .post(
    "/:id/cancel",
    handleEffect((c) =>
      Effect.gen(function* () {
        const { id } = yield* validateParams(c, TaskIdParams);
        const service = yield* TaskService;
        const comments = yield* CommentStore;
        const task = yield* service.cancel(id);
        yield* comments
          .recordInteraction({ taskId: task.id, kind: "cancelled" })
          .pipe(Effect.ignore({ log: true }));
        return serializeTask(task);
      }),
    ),
  );
