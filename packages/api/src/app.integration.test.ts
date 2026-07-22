import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { MongoDatabaseLive } from "@template/core/db/mongo/service";
import { PostgresDatabaseLive } from "@template/core/db/postgres/service";
import { CommentStoreLive } from "@template/core/domains/comments/store";
import { TasksLayer } from "@template/core/domains/tasks/layers";
import { SqsQueuePublisherLive } from "@template/core/queue/sqs-queue-publisher";
import { clearMongoTestData } from "@template/core/test/mongo-harness";
import {
  clearTestData,
  createTestSchema,
} from "@template/core/test/pg-harness";
import {
  makeTestSqsClient,
  purgeQueue,
  receiveMessageBodies,
} from "@template/core/test/queue-harness";
import { makeAppConfigTest, type AppConfigType } from "@template/shared/config";
import { Layer, ManagedRuntime, Option, Redacted } from "effect";
import { app } from "./app";
import { disposeApiRuntime, setApiRuntime } from "./lib/handle-effect";

const makeTestLayer = (overrides: Partial<AppConfigType> = {}) =>
  Layer.mergeAll(TasksLayer, CommentStoreLive).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        PostgresDatabaseLive,
        MongoDatabaseLive,
        SqsQueuePublisherLive,
      ),
    ),
    Layer.provideMerge(makeAppConfigTest(overrides)),
  );

const useRuntime = (overrides: Partial<AppConfigType> = {}) => {
  const runtime = ManagedRuntime.make(makeTestLayer(overrides));
  setApiRuntime(runtime as Parameters<typeof setApiRuntime>[0]);
  return runtime;
};

const json = async (response: Response) =>
  (await response.json()) as {
    status: string;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  };

const createTask = async (title = "enrich something") => {
  const response = await app.request("/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, description: "great input!" }),
  });
  expect(response.status).toBe(201);
  const body = await json(response);
  return body.data as { id: string; status: string };
};

describe("API end-to-end (real pg + mongo + elasticmq)", () => {
  let sqs: SQSClient;

  beforeAll(async () => {
    await createTestSchema();
    sqs = makeTestSqsClient();
    useRuntime();
  });

  afterAll(async () => {
    await disposeApiRuntime();
    sqs.destroy();
  });

  beforeEach(async () => {
    await clearTestData();
    await clearMongoTestData();
    await purgeQueue(sqs);
  });

  it("GET /health reports component status", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.data).toEqual({ postgres: "healthy", mongo: "healthy" });
  });

  it("POST /v1/tasks creates a pending task and enqueues execution", async () => {
    const task = await createTask("my task");
    expect(task.status).toBe("pending");
    const bodies = await receiveMessageBodies(sqs);
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!)).toEqual({
      type: "task.execute",
      taskId: task.id,
    });
  });

  it("POST /v1/tasks with an empty title returns the validation envelope", async () => {
    const response = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.status).toBe("failure");
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("GET /v1/tasks/:id composes the pg row with mongo comments", async () => {
    const task = await createTask();
    await app.request(`/v1/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: "ana", body: "looking good" }),
    });
    const response = await app.request(`/v1/tasks/${task.id}`);
    expect(response.status).toBe(200);
    const body = await json(response);
    const comments = body.data!.comments as Array<{ body: string }>;
    expect(body.data!.id).toBe(task.id);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe("looking good");
  });

  it("returns 404 for a missing task and 400 for a malformed id", async () => {
    const missing = await app.request(
      "/v1/tasks/0197c9c1-0000-7000-8000-000000000000",
    );
    expect(missing.status).toBe(404);
    expect((await json(missing)).error?.code).toBe("NOT_FOUND");

    const malformed = await app.request("/v1/tasks/not-a-uuid");
    expect(malformed.status).toBe(400);
    expect((await json(malformed)).error?.code).toBe("VALIDATION_ERROR");
  });

  it("records interactions for lifecycle events", async () => {
    const task = await createTask();
    await app.request(`/v1/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: "bob", body: "hi" }),
    });
    const response = await app.request(`/v1/tasks/${task.id}/interactions`);
    const body = await json(response);
    const kinds = (body.data!.items as Array<{ kind: string }>).map(
      (i) => i.kind,
    );
    expect(kinds).toEqual(["created", "commented"]);
  });

  it("cancel succeeds once and conflicts the second time", async () => {
    const task = await createTask();
    const first = await app.request(`/v1/tasks/${task.id}/cancel`, {
      method: "POST",
    });
    expect(first.status).toBe(200);
    expect(((await json(first)).data as { status: string }).status).toBe(
      "cancelled",
    );

    const second = await app.request(`/v1/tasks/${task.id}/cancel`, {
      method: "POST",
    });
    expect(second.status).toBe(409);
    expect((await json(second)).error?.code).toBe("CONFLICT");
  });

  it("unknown routes return the failure envelope", async () => {
    const response = await app.request("/v1/nope");
    expect(response.status).toBe(404);
    expect((await json(response)).error?.code).toBe("NOT_FOUND");
  });

  it("enforces bearer auth when API_TOKEN is configured", async () => {
    const secured = useRuntime({
      apiToken: Option.some(Redacted.make("sekret")),
    });
    try {
      const denied = await app.request("/v1/tasks");
      expect(denied.status).toBe(401);

      const allowed = await app.request("/v1/tasks", {
        headers: { authorization: "Bearer sekret" },
      });
      expect(allowed.status).toBe(200);
    } finally {
      await secured.dispose();
      useRuntime();
    }
  });
});
