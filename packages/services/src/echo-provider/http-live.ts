import { HttpClient } from "@effect/platform";
import { AppError, ProviderError } from "@template/shared/errors";
import { Effect, Layer, Redacted, Schema } from "effect";
import { makeJsonRequest } from "../http/base-client";
import { EchoProviderConfig } from "./config";
import { EchoProvider, type EchoProviderShape } from "./service";
import { EchoResult, type EchoRequest } from "./types";

const toProviderError = (error: AppError): ProviderError =>
  new ProviderError({
    provider: "echo",
    code: error.code,
    message: error.message,
    retryable: error.code === "SERVER_ERROR" || error.code === "TIMEOUT",
    cause: error,
  });

const decodeEchoResult = Schema.decodeUnknown(EchoResult);

/**
 * Real HTTP implementation. The base client already retried transient
 * failures, so an error surfacing here is final for this attempt — it is
 * mapped to ProviderError and left for the caller to interpret (the worker
 * marks the task failed rather than crashing the batch).
 */
export const EchoProviderHttpLive = Layer.effect(
  EchoProvider,
  Effect.gen(function* () {
    const config = yield* EchoProviderConfig;
    const httpClient = yield* HttpClient.HttpClient;

    const authHeaders = {
      authorization: `Bearer ${Redacted.value(config.apiKey)}`,
    };

    const process: EchoProviderShape["process"] = (request: EchoRequest) =>
      makeJsonRequest({
        method: "POST",
        url: `${config.baseUrl}/v1/enrich`,
        headers: authHeaders,
        body: { task_id: request.taskId, text: request.text },
        timeoutMs: config.timeoutMs,
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.mapError(toProviderError),
        Effect.flatMap((raw) =>
          decodeEchoResult(raw).pipe(
            Effect.mapError(
              (parseError) =>
                new ProviderError({
                  provider: "echo",
                  code: "INVALID_RESPONSE",
                  message: `echo provider returned an unexpected shape: ${parseError.message}`,
                  retryable: false,
                  cause: parseError,
                }),
            ),
          ),
        ),
      );

    const healthCheck: EchoProviderShape["healthCheck"] = () =>
      makeJsonRequest({
        method: "GET",
        url: `${config.baseUrl}/health`,
        timeoutMs: config.timeoutMs,
        retries: 0,
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.mapError(toProviderError),
        Effect.as(true),
      );

    return { process, healthCheck } satisfies EchoProviderShape;
  }),
);
