import { requestMetadataLayer } from "@template/shared/context";
import { Effect, Layer, ManagedRuntime } from "effect";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

export interface SqsBatchHandler {
  (event: SQSEvent): Promise<SQSBatchResponse>;
  /** Releases the container-scoped runtime (used by tests and the local poller). */
  readonly dispose: () => Promise<void>;
}

export interface MakeSqsBatchHandlerOptions<Msg, R, E, LE> {
  /** Decodes a record body; failures are treated as poison messages. */
  readonly decode: (body: string) => Effect.Effect<Msg, unknown>;
  readonly layer: Layer.Layer<R, LE>;
  readonly process: (
    message: Msg,
    record: SQSRecord,
  ) => Effect.Effect<void, E, R>;
}

/**
 * Generic SQS batch consumer following the platform pattern:
 * - one lazy ManagedRuntime per Lambda container (built on first record)
 * - each record runs independently; failures are reported per-record via
 *   batchItemFailures so SQS only redelivers what actually failed
 * - undecodable bodies are poison messages: retrying cannot fix them, so
 *   they are logged and dropped (the DLQ redrive policy still catches
 *   genuinely failing messages).
 */
export const makeSqsBatchHandler = <Msg, R, E, LE>(
  options: MakeSqsBatchHandlerOptions<Msg, R, E, LE>,
): SqsBatchHandler => {
  let runtime: ManagedRuntime.ManagedRuntime<R, LE> | undefined;
  const getRuntime = () => (runtime ??= ManagedRuntime.make(options.layer));

  const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];
    for (const record of event.Records) {
      const program = options.decode(record.body).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logError("dropping undecodable queue message", {
              messageId: record.messageId,
              error: String(error),
            }),
          onSuccess: (message) => options.process(message, record),
        }),
        Effect.provide(
          requestMetadataLayer({
            requestId: record.messageId,
            correlationId: record.messageId,
            operationKind: "queue",
          }),
        ),
      );
      try {
        await getRuntime().runPromise(program);
      } catch (error) {
        console.error("[sqs] record failed", {
          messageId: record.messageId,
          error,
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  };

  return Object.assign(handler, {
    dispose: async () => {
      if (runtime) {
        await runtime.dispose();
        runtime = undefined;
      }
    },
  });
};

/** Builds a minimal synthetic SQSEvent — used by tests and the local poller. */
export const makeSqsEvent = (
  messages: ReadonlyArray<{ messageId: string; body: string }>,
): SQSEvent => ({
  Records: messages.map(
    (message) =>
      ({
        messageId: message.messageId,
        receiptHandle: `local-${message.messageId}`,
        body: message.body,
        attributes: {},
        messageAttributes: {},
        md5OfBody: "",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:local:000000000000:task-execution",
        awsRegion: "us-east-1",
      }) as SQSRecord,
  ),
});
