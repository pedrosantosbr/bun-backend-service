import { CommentStore } from "@template/core/domains/comments/store";
import { TaskService } from "@template/core/domains/tasks/task-service";
import { Effect } from "effect";
import { Hono } from "hono";
import { handleEffect } from "../lib/handle-effect";
import { validateBody, validateParams, validateQuery } from "../lib/validate";
import {
  AddCommentBody,
  ListCommentsQuery,
  TaskIdParams,
} from "../schemas/tasks";

export const commentsRoutes = new Hono()
  .post(
    "/:id/comments",
    handleEffect(
      (c) =>
        Effect.gen(function* () {
          const { id } = yield* validateParams(c, TaskIdParams);
          const body = yield* validateBody(c, AddCommentBody);
          const service = yield* TaskService;
          const comments = yield* CommentStore;
          yield* service.get(id);
          const comment = yield* comments.addComment({ taskId: id, ...body });
          yield* comments
            .recordInteraction({
              taskId: id,
              kind: "commented",
              detail: { author: body.author },
            })
            .pipe(Effect.ignore({ log: true }));
          return comment;
        }),
      { successStatus: 201 },
    ),
  )
  .get(
    "/:id/comments",
    handleEffect((c) =>
      Effect.gen(function* () {
        const { id } = yield* validateParams(c, TaskIdParams);
        const query = yield* validateQuery(c, ListCommentsQuery);
        const comments = yield* CommentStore;
        const items = yield* comments.listByTaskId(id, {
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.before !== undefined
            ? { before: new Date(query.before) }
            : {}),
        });
        return { items };
      }),
    ),
  )
  .get(
    "/:id/interactions",
    handleEffect((c) =>
      Effect.gen(function* () {
        const { id } = yield* validateParams(c, TaskIdParams);
        const comments = yield* CommentStore;
        const items = yield* comments.listInteractions(id);
        return { items };
      }),
    ),
  );
