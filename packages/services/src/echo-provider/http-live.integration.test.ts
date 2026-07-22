import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { Effect, Layer } from "effect";
import { HttpClientLive } from "../http/base-client";
import { makeEchoProviderConfigTest } from "./config";
import { EchoProviderHttpLive } from "./http-live";
import { EchoProvider } from "./service";

/**
 * Runs the REAL HTTP implementation against an in-process Bun.serve stub —
 * the one place where stubbing is legitimate, because the provider is a
 * true external boundary.
 */
describe("EchoProviderHttpLive (Bun.serve stub)", () => {
  let server: ReturnType<typeof Bun.serve>;
  let requests: Array<{ path: string; auth: string | null; body?: unknown }>;
  let failuresBeforeSuccess = 0;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url);
        const record: { path: string; auth: string | null; body?: unknown } = {
          path: url.pathname,
          auth: req.headers.get("authorization"),
        };
        if (req.method === "POST") record.body = await req.json();
        requests.push(record);

        if (url.pathname === "/health") return Response.json({ ok: true });
        if (url.pathname === "/v1/enrich") {
          if (failuresBeforeSuccess > 0) {
            failuresBeforeSuccess--;
            return new Response("upstream exploded", { status: 500 });
          }
          const body = record.body as { text: string };
          if (body.text === "give-me-garbage") {
            return Response.json({ totally: "unexpected" });
          }
          if (body.text === "forbidden") {
            return new Response("nope", { status: 403 });
          }
          return Response.json({
            echoed: body.text,
            sentiment: "positive",
            processedAt: new Date().toISOString(),
          });
        }
        return new Response("not found", { status: 404 });
      },
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  beforeEach(() => {
    requests = [];
    failuresBeforeSuccess = 0;
  });

  const makeLayer = () =>
    EchoProviderHttpLive.pipe(
      Layer.provide(
        makeEchoProviderConfigTest({
          baseUrl: `http://localhost:${server.port}`,
        }),
      ),
      Layer.provide(HttpClientLive),
    );

  const process = (text: string) =>
    Effect.gen(function* () {
      const provider = yield* EchoProvider;
      return yield* provider.process({ taskId: "task-1", text });
    }).pipe(Effect.provide(makeLayer()), Effect.runPromise);

  it("posts to /v1/enrich with bearer auth and decodes the result", async () => {
    const result = await process("hello");
    expect(result.echoed).toBe("hello");
    expect(result.sentiment).toBe("positive");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.auth).toBe("Bearer test-key");
    expect(requests[0]!.body).toEqual({ task_id: "task-1", text: "hello" });
  });

  it("retries 5xx responses and eventually succeeds", async () => {
    failuresBeforeSuccess = 2;
    const result = await process("retry me");
    expect(result.echoed).toBe("retry me");
    expect(requests).toHaveLength(3);
  });

  it("does not retry 4xx and surfaces CLIENT_ERROR", async () => {
    const error = await Effect.gen(function* () {
      const provider = yield* EchoProvider;
      return yield* provider
        .process({ taskId: "task-1", text: "forbidden" })
        .pipe(Effect.flip);
    }).pipe(Effect.provide(makeLayer()), Effect.runPromise);
    expect(error._tag).toBe("ProviderError");
    expect(error.code).toBe("CLIENT_ERROR");
    expect(error.retryable).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("maps schema drift to INVALID_RESPONSE", async () => {
    const error = await Effect.gen(function* () {
      const provider = yield* EchoProvider;
      return yield* provider
        .process({ taskId: "task-1", text: "give-me-garbage" })
        .pipe(Effect.flip);
    }).pipe(Effect.provide(makeLayer()), Effect.runPromise);
    expect(error._tag).toBe("ProviderError");
    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it("healthCheck hits /health", async () => {
    const healthy = await Effect.gen(function* () {
      const provider = yield* EchoProvider;
      return yield* provider.healthCheck();
    }).pipe(Effect.provide(makeLayer()), Effect.runPromise);
    expect(healthy).toBe(true);
    expect(requests[0]!.path).toBe("/health");
  });
});
