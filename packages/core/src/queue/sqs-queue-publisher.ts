import {
  SendMessageBatchCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { AppConfigService } from "@template/shared/config";
import { QueueError } from "@template/shared/errors";
import { Effect, Layer, Option } from "effect";
import { QueuePublisher, type QueuePublisherShape } from "./queue-publisher";

const BATCH_SIZE = 10;

const trySqs = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, QueueError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new QueueError({
        message: cause instanceof Error ? cause.message : String(cause),
        operation,
        cause,
      }),
  });

/**
 * SQS-backed publisher. When SQS_ENDPOINT is set (local ElasticMQ) the
 * client gets an endpoint override plus dummy static credentials — without
 * them the AWS SDK walks the real credential-provider chain and hangs.
 * In production the endpoint is unset and the default chain (Lambda role)
 * applies.
 */
export const SqsQueuePublisherLive = Layer.effect(
  QueuePublisher,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const isLocalStage = config.stage === "local" || config.stage === "test";
    const endpoint =
      Option.getOrUndefined(config.sqsEndpoint) ??
      (isLocalStage ? "http://localhost:9324" : undefined);
    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new SQSClient(
            endpoint
              ? {
                  endpoint,
                  region: "us-east-1",
                  credentials: {
                    accessKeyId: "local",
                    secretAccessKey: "local",
                  },
                }
              : {},
          ),
      ),
      (sqs) => Effect.sync(() => sqs.destroy()),
    );

    return {
      send: (queueUrl, message) =>
        trySqs("QueuePublisher.send", () =>
          client.send(
            new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: message.body,
              ...(message.delaySeconds !== undefined
                ? { DelaySeconds: message.delaySeconds }
                : {}),
            }),
          ),
        ).pipe(
          Effect.map((output) => ({
            messageId: output.MessageId ?? "unknown",
          })),
        ),

      sendBatch: (queueUrl, messages) =>
        Effect.gen(function* () {
          let successCount = 0;
          let failedCount = 0;
          for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const chunk = messages.slice(i, i + BATCH_SIZE);
            const output = yield* trySqs("QueuePublisher.sendBatch", () =>
              client.send(
                new SendMessageBatchCommand({
                  QueueUrl: queueUrl,
                  Entries: chunk.map((message, index) => ({
                    Id: String(i + index),
                    MessageBody: message.body,
                    ...(message.delaySeconds !== undefined
                      ? { DelaySeconds: message.delaySeconds }
                      : {}),
                  })),
                }),
              ),
            );
            successCount += output.Successful?.length ?? 0;
            failedCount += output.Failed?.length ?? 0;
          }
          return { successCount, failedCount };
        }),
    } satisfies QueuePublisherShape;
  }),
);
