import type { MongoQueryError } from "@template/shared/errors";
import { Context, Effect, Layer } from "effect";
import { MongoDatabaseService, runMongo } from "../../db/mongo/service";
import {
  getCommentModel,
  getInteractionModel,
  type InteractionKind,
} from "./db/models";

export interface CommentView {
  readonly id: string;
  readonly taskId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface InteractionView {
  readonly id: string;
  readonly taskId: string;
  readonly kind: InteractionKind;
  readonly detail?: Record<string, unknown>;
  readonly at: Date;
}

export interface AddCommentInput {
  readonly taskId: string;
  readonly author: string;
  readonly body: string;
}

export interface RecordInteractionInput {
  readonly taskId: string;
  readonly kind: InteractionKind;
  readonly detail?: Record<string, unknown>;
}

export interface ListCommentsOptions {
  readonly limit?: number;
  /** Return comments strictly older than this timestamp (for paging back). */
  readonly before?: Date;
}

export interface CommentStoreShape {
  readonly addComment: (
    input: AddCommentInput,
  ) => Effect.Effect<CommentView, MongoQueryError>;
  readonly listByTaskId: (
    taskId: string,
    options?: ListCommentsOptions,
  ) => Effect.Effect<readonly CommentView[], MongoQueryError>;
  readonly recordInteraction: (
    input: RecordInteractionInput,
  ) => Effect.Effect<void, MongoQueryError>;
  readonly listInteractions: (
    taskId: string,
  ) => Effect.Effect<readonly InteractionView[], MongoQueryError>;
}

export class CommentStore extends Context.Service<
  CommentStore,
  CommentStoreShape
>()("@template/core/CommentStore") {}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const CommentStoreLive = Layer.effect(
  CommentStore,
  Effect.gen(function* () {
    const { connection } = yield* MongoDatabaseService;
    const comments = getCommentModel(connection);
    const interactions = getInteractionModel(connection);

    return {
      addComment: (input) =>
        runMongo("CommentStore.addComment", () =>
          comments.create({ ...input }),
        ).pipe(
          Effect.map((doc) => ({
            id: doc.id as string,
            taskId: doc.taskId,
            author: doc.author,
            body: doc.body,
            createdAt: doc.createdAt,
          })),
        ),

      listByTaskId: (taskId, options = {}) => {
        const pageSize = Math.min(
          Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1),
          MAX_PAGE_SIZE,
        );
        return runMongo("CommentStore.listByTaskId", () =>
          comments
            .find({
              taskId,
              ...(options.before ? { createdAt: { $lt: options.before } } : {}),
            })
            .sort({ createdAt: -1 })
            .limit(pageSize)
            .lean<
              Array<{
                _id: unknown;
                taskId: string;
                author: string;
                body: string;
                createdAt: Date;
              }>
            >()
            .exec(),
        ).pipe(
          Effect.map((docs) =>
            docs.map((doc) => ({
              id: String(doc._id),
              taskId: doc.taskId,
              author: doc.author,
              body: doc.body,
              createdAt: doc.createdAt,
            })),
          ),
        );
      },

      recordInteraction: (input) =>
        runMongo("CommentStore.recordInteraction", () =>
          interactions.create({ ...input, at: new Date() }),
        ).pipe(Effect.asVoid),

      listInteractions: (taskId) =>
        runMongo("CommentStore.listInteractions", () =>
          interactions
            .find({ taskId })
            .sort({ at: 1 })
            .lean<
              Array<{
                _id: unknown;
                taskId: string;
                kind: InteractionKind;
                detail?: Record<string, unknown>;
                at: Date;
              }>
            >()
            .exec(),
        ).pipe(
          Effect.map((docs) =>
            docs.map((doc) => ({
              id: String(doc._id),
              taskId: doc.taskId,
              kind: doc.kind,
              ...(doc.detail !== undefined ? { detail: doc.detail } : {}),
              at: doc.at,
            })),
          ),
        ),
    } satisfies CommentStoreShape;
  }),
);
