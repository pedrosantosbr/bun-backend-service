import { QueueError } from "@template/shared/errors";
import { Effect, Layer } from "effect";
import { QueuePublisher, type QueueMessage } from "./queue-publisher";

export interface SentMessage {
  readonly queueUrl: string;
  readonly message: QueueMessage;
}

export interface FakeQueuePublisher {
  readonly layer: Layer.Layer<QueuePublisher>;
  readonly sent: SentMessage[];
  readonly drain: () => SentMessage[];
}

/**
 * In-memory QueuePublisher for unit tests and local experiments. Pass
 * `failWith` to exercise publish-failure paths.
 */
export const makeFakeQueuePublisher = (options?: {
  failWith?: QueueError;
}): FakeQueuePublisher => {
  const sent: SentMessage[] = [];
  const layer = Layer.succeed(QueuePublisher, {
    send: (queueUrl, message) =>
      options?.failWith
        ? Effect.fail(options.failWith)
        : Effect.sync(() => {
            sent.push({ queueUrl, message });
            return { messageId: `fake-${sent.length}` };
          }),
    sendBatch: (queueUrl, messages) =>
      options?.failWith
        ? Effect.fail(options.failWith)
        : Effect.sync(() => {
            for (const message of messages) sent.push({ queueUrl, message });
            return { successCount: messages.length, failedCount: 0 };
          }),
  });
  return {
    layer,
    sent,
    drain: () => sent.splice(0, sent.length),
  };
};
