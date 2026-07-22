import { requestMetadataLayer } from "@template/shared/context";
import { TimeoutError } from "@template/shared/errors";
import { createId } from "@template/shared/ids";
import { Cause, Duration, Effect, Exit, ManagedRuntime, Option } from "effect";
import type { Context as HonoContext } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiLayer, type ApiServices } from "../layers";
import { errorToResponse, ok } from "./response";

type ApiRuntime = ManagedRuntime.ManagedRuntime<ApiServices, unknown>;

let apiRuntime: ApiRuntime | undefined;

/** Lazy per-process runtime — one layer build per container, like platform. */
export const getApiRuntime = (): ApiRuntime => {
  apiRuntime ??= ManagedRuntime.make(ApiLayer) as ApiRuntime;
  return apiRuntime;
};

/** Test seam: swap the runtime the routes execute against. */
export const setApiRuntime = (runtime: ApiRuntime): void => {
  apiRuntime = runtime;
};

export const disposeApiRuntime = async (): Promise<void> => {
  if (apiRuntime) {
    await apiRuntime.dispose();
    apiRuntime = undefined;
  }
};

export interface HandleEffectOptions {
  readonly successStatus?: ContentfulStatusCode;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Bridges an Effect program into a Hono handler: provides per-request
 * metadata (correlation ids from headers), enforces a timeout, runs on the
 * shared runtime and renders the success/failure envelope.
 */
export const handleEffect =
  <A, E>(
    fn: (c: HonoContext) => Effect.Effect<A, E, ApiServices>,
    options: HandleEffectOptions = {},
  ) =>
  async (c: HonoContext): Promise<Response> => {
    const requestId = c.req.header("x-request-id") ?? createId();
    const correlationId = c.req.header("x-correlation-id") ?? requestId;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const program = fn(c).pipe(
      Effect.timeoutFail({
        duration: Duration.millis(timeoutMs),
        onTimeout: () =>
          new TimeoutError({
            message: `request timed out after ${timeoutMs}ms`,
            timeoutMs,
          }),
      }),
      Effect.provide(
        requestMetadataLayer({
          requestId,
          correlationId,
          operationKind: "http",
        }),
      ),
    );

    const exit = await getApiRuntime().runPromiseExit(program);
    c.header("x-request-id", requestId);

    if (Exit.isSuccess(exit)) {
      return c.json(ok(exit.value), options.successStatus ?? 200);
    }

    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) {
      console.error(`[api] defect handling ${c.req.method} ${c.req.path}`, {
        requestId,
        cause: Cause.pretty(exit.cause),
      });
      const { httpStatus, envelope } = errorToResponse(undefined);
      return c.json(envelope, httpStatus as ContentfulStatusCode);
    }

    const { httpStatus, envelope } = errorToResponse(failure.value);
    if (httpStatus >= 500) {
      console.error(`[api] ${c.req.method} ${c.req.path} failed`, {
        requestId,
        error: failure.value,
      });
    }
    return c.json(envelope, httpStatus as ContentfulStatusCode);
  };
