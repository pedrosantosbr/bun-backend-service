import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { MongoDatabaseLive } from "@template/core/db/mongo/service";
import { PostgresDatabaseLive } from "@template/core/db/postgres/service";
import {
  CommentStore,
  CommentStoreLive,
} from "@template/core/domains/comments/store";
import { TasksLayer } from "@template/core/domains/tasks/layers";
import { TaskStore } from "@template/core/domains/tasks/store";
import { encodeTaskExecuteMessage } from "@template/core/queue/messages";
import { makeFakeQueuePublisher } from "@template/core/queue/fake-queue-publisher";
import { clearMongoTestData } from "@template/core/test/mongo-harness";
import {
  clearTestData,
  createTestSchema,
} from "@template/core/test/pg-harness";
import {
  setupTestRuntime,
  type TestRuntime,
} from "@template/core/test/runtime";
import {
  EchoProviderFake,
  makeEchoProviderFake,
} from "@template/services/echo-provider/fake";
import { makeAppConfigTest } from "@template/shared/config";
import type { EchoProvider } from "@template/services/echo-provider/service";
import { createId } from "@template/shared/ids";
import { ProviderError } from "@template/shared/errors";
import { Effect, Layer } from "effect";
import { makeSqsEvent } from "../lib/sqs";
import { makeTaskExecutorHandler } from "./task-executor";

const makeWorkerLayer = (provider: Layer.Layer<EchoProvider>) =>
  Layer.mergeAll(TasksLayer, CommentStoreLive, provider).pipe(
    Layer.provideMerge(Layer.mergeAll(PostgresDatabaseLive, MongoDatabaseLive)),
    Layer.provideMerge(makeFakeQueuePublisher().layer),
    Layer.provideMerge(makeAppConfigTest()),
  );

describe("task-executor worker", () => {
  let runtime: TestRuntime<TaskStore | CommentStore>;

  beforeAll(async () => {
    await createTestSchema();
    runtime = setupTestRuntime(
      Layer.mergeAll(
        TasksLayer.pipe(Layer.provide(makeFakeQueuePublisher().layer)),
        CommentStoreLive,
      ).pipe(
        Layer.provideMerge(
          Layer.mergeAll(PostgresDatabaseLive, MongoDatabaseLive),
        ),
        Layer.provideMerge(makeAppConfigTest()),
      ),
    );
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  beforeEach(async () => {
    await clearTestData();
    await clearMongoTestData();
  });

  const insertPendingTask = (description = "great news!") =>
    runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.insert({
          id: createId(),
          title: "work item",
          description,
        });
      }),
    );

  const getTask = (id: string) =>
    runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.findById(id);
      }),
    );

  const getInteractions = (taskId: string) =>
    runtime.runTest(
      Effect.gen(function* () {
        const comments = yield* CommentStore;
        return yield* comments.listInteractions(taskId);
      }),
    );

  it("completes a pending task via the provider and records interactions", async () => {
    const task = await insertPendingTask();
    const handler = makeTaskExecutorHandler(makeWorkerLayer(EchoProviderFake));
    try {
      const response = await handler(
        makeSqsEvent([
          { messageId: "m1", body: encodeTaskExecuteMessage(task.id) },
        ]),
      );
      expect(response.batchItemFailures).toHaveLength(0);

      const updated = await getTask(task.id);
      expect(updated.status).toBe("completed");
      expect(updated.attemptCount).toBe(1);
      expect(updated.result).toMatchObject({
        echoed: "great news!",
        sentiment: "positive",
      });
      expect(updated.completedAt).not.toBeNull();

      const kinds = (await getInteractions(task.id)).map((i) => i.kind);
      expect(kinds).toEqual(["processing", "completed"]);
    } finally {
      await handler.dispose();
    }
  });

  it("marks the task failed on ProviderError without failing the batch", async () => {
    const task = await insertPendingTask();
    const failingProvider = makeEchoProviderFake({
      failWith: new ProviderError({
        provider: "echo",
        code: "SERVER_ERROR",
        message: "upstream exploded",
        retryable: true,
      }),
    });
    const handler = makeTaskExecutorHandler(makeWorkerLayer(failingProvider));
    try {
      const response = await handler(
        makeSqsEvent([
          { messageId: "m1", body: encodeTaskExecuteMessage(task.id) },
        ]),
      );
      expect(response.batchItemFailures).toHaveLength(0);

      const updated = await getTask(task.id);
      expect(updated.status).toBe("failed");
      expect(updated.failureReason).toContain("SERVER_ERROR");

      const kinds = (await getInteractions(task.id)).map((i) => i.kind);
      expect(kinds).toEqual(["processing", "failed"]);
    } finally {
      await handler.dispose();
    }
  });

  it("drops poison messages and processes the rest of the batch", async () => {
    const task = await insertPendingTask();
    const handler = makeTaskExecutorHandler(makeWorkerLayer(EchoProviderFake));
    try {
      const response = await handler(
        makeSqsEvent([
          { messageId: "poison", body: "not even json" },
          { messageId: "ok", body: encodeTaskExecuteMessage(task.id) },
        ]),
      );
      expect(response.batchItemFailures).toHaveLength(0);
      expect((await getTask(task.id)).status).toBe("completed");
    } finally {
      await handler.dispose();
    }
  });

  it("skips tasks that are no longer claimable (idempotent redelivery)", async () => {
    const task = await insertPendingTask();
    const handler = makeTaskExecutorHandler(makeWorkerLayer(EchoProviderFake));
    try {
      const event = makeSqsEvent([
        { messageId: "m1", body: encodeTaskExecuteMessage(task.id) },
      ]);
      await handler(event);
      const redelivery = await handler(event);
      expect(redelivery.batchItemFailures).toHaveLength(0);

      const updated = await getTask(task.id);
      expect(updated.status).toBe("completed");
      expect(updated.attemptCount).toBe(1);
    } finally {
      await handler.dispose();
    }
  });
});
