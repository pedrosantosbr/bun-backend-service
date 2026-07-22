import { MongoDatabaseLive } from "@template/core/db/mongo/service";
import { PostgresDatabaseLive } from "@template/core/db/postgres/service";
import { CommentStoreLive } from "@template/core/domains/comments/store";
import { TasksLayer } from "@template/core/domains/tasks/layers";
import { SqsQueuePublisherLive } from "@template/core/queue/sqs-queue-publisher";
import { AppConfigLive } from "@template/shared/config";
import { Layer } from "effect";

/**
 * Everything API routes may depend on. Infrastructure layers are merged
 * BEFORE domain layers are provided from them, so the whole graph shares
 * one pool/connection/client per runtime (layers are memoized by instance).
 */
const InfrastructureLayer = Layer.mergeAll(
  PostgresDatabaseLive,
  MongoDatabaseLive,
  SqsQueuePublisherLive,
).pipe(Layer.provideMerge(AppConfigLive));

export const ApiLayer = Layer.mergeAll(TasksLayer, CommentStoreLive).pipe(
  Layer.provideMerge(InfrastructureLayer),
);

export type ApiServices = Layer.Layer.Success<typeof ApiLayer>;
