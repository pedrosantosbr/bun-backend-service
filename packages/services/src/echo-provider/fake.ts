import type { ProviderError } from "@template/shared/errors";
import { Effect, Layer } from "effect";
import { EchoProvider, type EchoProviderShape } from "./service";
import type { EchoResult } from "./types";

const inferSentiment = (text: string): EchoResult["sentiment"] => {
  const lowered = text.toLowerCase();
  if (lowered.includes("great") || lowered.includes("!")) return "positive";
  if (lowered.includes("bad") || lowered.includes("angry")) return "negative";
  return "neutral";
};

export interface FakeEchoProviderOptions {
  readonly failWith?: ProviderError;
  readonly delayMs?: number;
}

/**
 * Deterministic in-memory implementation, used in tests and as the default
 * local-dev mode (ECHO_PROVIDER_MODE=fake) so `bun run dev` works without
 * any real upstream.
 */
export const makeEchoProviderFake = (
  options: FakeEchoProviderOptions = {},
): Layer.Layer<EchoProvider> =>
  Layer.succeed(EchoProvider, {
    process: (request) => {
      const result: Effect.Effect<EchoResult, ProviderError> = options.failWith
        ? Effect.fail(options.failWith)
        : Effect.sync(() => ({
            echoed: request.text,
            sentiment: inferSentiment(request.text),
            processedAt: new Date().toISOString(),
          }));
      return options.delayMs !== undefined
        ? result.pipe(Effect.delay(options.delayMs))
        : result;
    },
    healthCheck: () =>
      options.failWith ? Effect.fail(options.failWith) : Effect.succeed(true),
  } satisfies EchoProviderShape);

export const EchoProviderFake = makeEchoProviderFake();
