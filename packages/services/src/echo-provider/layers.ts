import { AppConfigService } from "@template/shared/config";
import { Effect, Layer } from "effect";
import { HttpClientLive } from "../http/base-client";
import { EchoProviderConfigLive } from "./config";
import { EchoProviderFake } from "./fake";
import { EchoProviderHttpLive } from "./http-live";

/**
 * Selects the provider implementation from config: ECHO_PROVIDER_MODE=http
 * uses the real HTTP client, anything else the deterministic fake. Both
 * branches are fully self-contained apart from AppConfigService.
 */
export const EchoProviderLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    if (config.echoProvider.mode === "http") {
      return EchoProviderHttpLive.pipe(
        Layer.provide(EchoProviderConfigLive),
        Layer.provide(HttpClientLive),
      );
    }
    return EchoProviderFake;
  }),
);
