import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { getCorrelationId, getRequestId } from "@template/shared/context";
import { AppError } from "@template/shared/errors";
import { Duration, Effect, Schedule } from "effect";

export interface JsonRequestOptions {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly retries?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 3;

const RETRYABLE_CODES = new Set(["SERVER_ERROR", "NETWORK_ERROR", "TIMEOUT"]);

/** The live fetch-backed HTTP client layer (Bun/Node native fetch). */
export const HttpClientLive = FetchHttpClient.layer;

/**
 * Issues a JSON request and returns the parsed body as `unknown` — callers
 * decode with an Effect Schema at their boundary. Handles: correlation
 * header propagation, timeout, exponential retry on transport/5xx errors,
 * and HTTP status → AppError mapping.
 */
export const makeJsonRequest = (
  options: JsonRequestOptions,
): Effect.Effect<unknown, AppError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const requestId = yield* getRequestId;
    const correlationId = yield* getCorrelationId;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const baseRequest = HttpClientRequest.make(options.method)(
      options.url,
    ).pipe(
      HttpClientRequest.setHeaders({
        accept: "application/json",
        ...(requestId ? { "x-request-id": requestId } : {}),
        ...(correlationId ? { "x-correlation-id": correlationId } : {}),
        ...options.headers,
      }),
    );

    const request =
      options.body !== undefined
        ? yield* HttpClientRequest.bodyJson(options.body)(baseRequest).pipe(
            Effect.mapError(
              (error) =>
                new AppError({
                  code: "REQUEST_BODY_ERROR",
                  message: `failed to serialize request body: ${String(error)}`,
                  cause: error,
                }),
            ),
          )
        : baseRequest;

    const attempt = Effect.scoped(
      Effect.gen(function* () {
        const response = yield* client.execute(request).pipe(
          Effect.mapError(
            (error) =>
              new AppError({
                code: "NETWORK_ERROR",
                message: `${options.method} ${options.url} failed: ${String(error)}`,
                cause: error,
              }),
          ),
          Effect.timeoutFail({
            duration: Duration.millis(timeoutMs),
            onTimeout: () =>
              new AppError({
                code: "TIMEOUT",
                message: `${options.method} ${options.url} timed out after ${timeoutMs}ms`,
              }),
          }),
        );
        if (response.status < 200 || response.status >= 300) {
          const bodyText = yield* response.text.pipe(
            Effect.orElseSucceed(() => ""),
          );
          return yield* new AppError({
            code: response.status >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR",
            message: `${options.method} ${options.url} returned ${response.status}`,
            details: { status: response.status, body: bodyText.slice(0, 500) },
          });
        }
        if (response.status === 204) return undefined;
        return yield* response.json.pipe(
          Effect.mapError(
            (error) =>
              new AppError({
                code: "PARSE_ERROR",
                message: `${options.method} ${options.url} returned invalid JSON`,
                cause: error,
              }),
          ),
        );
      }),
    );

    return yield* attempt.pipe(
      Effect.retry({
        schedule: Schedule.exponential(Duration.millis(100)).pipe(
          Schedule.intersect(
            Schedule.recurs(options.retries ?? DEFAULT_RETRIES),
          ),
        ),
        while: (error) => RETRYABLE_CODES.has(error.code),
      }),
    );
  });
