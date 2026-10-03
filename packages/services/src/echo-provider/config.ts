import { AppConfigService } from "@template/shared/config";
import { Context, Effect, Layer, Redacted } from "effect";

export interface EchoProviderConfigShape {
  readonly baseUrl: string;
  readonly apiKey: Redacted.Redacted<string>;
  readonly timeoutMs: number;
}

export class EchoProviderConfig extends Context.Service<
  EchoProviderConfig,
  EchoProviderConfigShape
>()("@template/services/EchoProviderConfig") {}

export const EchoProviderConfigLive = Layer.effect(
  EchoProviderConfig,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return {
      baseUrl: config.echoProvider.baseUrl,
      apiKey: config.echoProvider.apiKey,
      timeoutMs: config.echoProvider.timeoutMs,
    };
  }),
);

export const makeEchoProviderConfigTest = (
  overrides: Partial<EchoProviderConfigShape> = {},
): Layer.Layer<EchoProviderConfig> =>
  Layer.succeed(EchoProviderConfig, {
    baseUrl: "http://localhost:4010",
    apiKey: Redacted.make("test-key"),
    timeoutMs: 2_000,
    ...overrides,
  });
