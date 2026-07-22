import {
  Schema as MongooseSchema,
  type Connection,
  type Model,
} from "mongoose";

export interface CommentDoc {
  taskId: string;
  author: string;
  body: string;
  createdAt: Date;
}

const commentSchema = new MongooseSchema<CommentDoc>(
  {
    taskId: { type: String, required: true, index: true },
    author: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const interactionKinds = [
  "created",
  "commented",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type InteractionKind = (typeof interactionKinds)[number];

export interface InteractionDoc {
  taskId: string;
  kind: InteractionKind;
  detail?: Record<string, unknown>;
  at: Date;
}

const interactionSchema = new MongooseSchema<InteractionDoc>(
  {
    taskId: { type: String, required: true, index: true },
    kind: { type: String, required: true, enum: interactionKinds },
    detail: { type: MongooseSchema.Types.Mixed },
    at: { type: Date, required: true },
  },
  { timestamps: false },
);

// Models are memoized per connection: registering the same name twice on one
// connection throws, and using the mongoose global would leak across tests.
export const getCommentModel = (connection: Connection): Model<CommentDoc> =>
  (connection.models.Comment as Model<CommentDoc> | undefined) ??
  connection.model<CommentDoc>("Comment", commentSchema);

export const getInteractionModel = (
  connection: Connection,
): Model<InteractionDoc> =>
  (connection.models.Interaction as Model<InteractionDoc> | undefined) ??
  connection.model<InteractionDoc>("Interaction", interactionSchema);
