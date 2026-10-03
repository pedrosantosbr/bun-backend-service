import { Context, Effect, Layer, Option } from "effect";

export type OperationKind = "http" | "queue" | "cron" | "script" | "test";

export interface RequestMetadata {
  readonly requestId: string;
  readonly correlationId: string;
  readonly operationKind: OperationKind;
  readonly userId?: string;
}

export class RequestMetadataService extends Context.Service<
  RequestMetadataService,
  RequestMetadata
>()("@template/shared/RequestMetadataService") {}

export const requestMetadataLayer = (
  metadata: RequestMetadata,
): Layer.Layer<RequestMetadataService> =>
  Layer.succeed(RequestMetadataService, metadata);

const metadataField = (
  pick: (metadata: RequestMetadata) => string | undefined,
): Effect.Effect<string | undefined> =>
  Effect.serviceOption(RequestMetadataService).pipe(
    Effect.map(Option.match({ onNone: () => undefined, onSome: pick })),
  );

export const getRequestId = metadataField((m) => m.requestId);
export const getCorrelationId = metadataField((m) => m.correlationId);
export const getUserId = metadataField((m) => m.userId);
