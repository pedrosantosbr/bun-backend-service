import type { ProviderError } from "@template/shared/errors";
import { Context, type Effect } from "effect";
import type { EchoRequest, EchoResult } from "./types";

/**
 * The provider interface the rest of the codebase depends on. Consumers
 * never see HTTP details — they can run against the real implementation
 * (http-live.ts) or the fake (fake.ts) interchangeably.
 */
export interface EchoProviderShape {
  readonly process: (
    request: EchoRequest,
  ) => Effect.Effect<EchoResult, ProviderError>;
  readonly healthCheck: () => Effect.Effect<boolean, ProviderError>;
}

export class EchoProvider extends Context.Service<
  EchoProvider,
  EchoProviderShape
>()("@template/services/EchoProvider") {}
