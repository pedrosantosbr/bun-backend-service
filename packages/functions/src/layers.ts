import { MongoDatabaseLive } from "@template/core/db/mongo/service";
import { PostgresDatabaseLive } from "@template/core/db/postgres/service";
import { CommentStoreLive } from "@template/core/domains/comments/store";
import { TasksLayer } from "@template/core/domains/tasks/layers";
import { SqsQueuePublisherLive } from "@template/core/queue/sqs-queue-publisher";
import { EchoProviderLive } from "@template/services/echo-provider/layers";
import { AppConfigLive } from "@template/shared/config";
import { Layer } from "effect";

const InfrastructureLayer = Layer.mergeAll(
  PostgresDatabaseLive,
  MongoDatabaseLive,
  SqsQueuePublisherLive,
).pipe(Layer.provideMerge(AppConfigLive));

/** Full dependency graph for the task-executor worker. */
export const WorkerLayer = Layer.mergeAll(
  TasksLayer,
  CommentStoreLive,
  EchoProviderLive,
).pipe(Layer.provideMerge(InfrastructureLayer));

/** The requeue cron needs no provider or mongo access. */
export const CronLayer = Layer.mergeAll(TasksLayer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(PostgresDatabaseLive, SqsQueuePublisherLive).pipe(
      Layer.provideMerge(AppConfigLive),
    ),
  ),
);
