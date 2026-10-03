import type { QueueError } from "@template/shared/errors";
import { Context, type Effect } from "effect";

export interface QueueMessage {
  readonly body: string;
  readonly delaySeconds?: number;
}

export interface QueuePublisherShape {
  readonly send: (
    queueUrl: string,
    message: QueueMessage,
  ) => Effect.Effect<{ messageId: string }, QueueError>;
  readonly sendBatch: (
    queueUrl: string,
    messages: readonly QueueMessage[],
  ) => Effect.Effect<{ successCount: number; failedCount: number }, QueueError>;
}

export class QueuePublisher extends Context.Service<
  QueuePublisher,
  QueuePublisherShape
>()("@template/core/QueuePublisher") {}
