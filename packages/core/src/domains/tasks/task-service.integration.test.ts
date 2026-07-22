import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { defaultTestConfig, makeAppConfigTest } from "@template/shared/config";
import { QueueError } from "@template/shared/errors";
import { Effect, Layer } from "effect";
import { PostgresDatabaseLive } from "../../db/postgres/service";
import {
  makeFakeQueuePublisher,
  type FakeQueuePublisher,
} from "../../queue/fake-queue-publisher";
import { clearTestData, createTestSchema } from "../../test/pg-harness";
import { setupTestRuntime, type TestRuntime } from "../../test/runtime";
import { TasksLayer } from "./layers";
import { TaskService } from "./task-service";

const makeRuntime = (publisher: FakeQueuePublisher) =>
  setupTestRuntime(
    TasksLayer.pipe(
      Layer.provide(PostgresDatabaseLive),
      Layer.provide(publisher.layer),
      Layer.provide(makeAppConfigTest()),
    ),
  );

describe("TaskService (postgres + fake queue)", () => {
  let publisher: FakeQueuePublisher;
  let runtime: TestRuntime<TaskService>;

  beforeAll(async () => {
    await createTestSchema();
    publisher = makeFakeQueuePublisher();
    runtime = makeRuntime(publisher);
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  beforeEach(async () => {
    await clearTestData();
    publisher.drain();
  });

  it("create inserts a pending task and enqueues execution", async () => {
    const task = await runtime.runTest(
      Effect.gen(function* () {
        const service = yield* TaskService;
        return yield* service.create({ title: "enrich", description: "hi" });
      }),
    );
    expect(task.status).toBe("pending");
    expect(publisher.sent).toHaveLength(1);
    const sent = publisher.sent[0]!;
    expect(sent.queueUrl).toBe(defaultTestConfig.taskQueueUrl);
    expect(JSON.parse(sent.message.body)).toEqual({
      type: "task.execute",
      taskId: task.id,
    });
  });

  it("create fails with QueueError when publish fails, row stays pending", async () => {
    const failing = makeFakeQueuePublisher({
      failWith: new QueueError({ message: "queue down", operation: "send" }),
    });
    const failingRuntime = makeRuntime(failing);
    try {
      const error = await failingRuntime.runTest(
        Effect.gen(function* () {
          const service = yield* TaskService;
          return yield* service.create({ title: "doomed" }).pipe(Effect.flip);
        }),
      );
      expect(error._tag).toBe("QueueError");
      const { items } = await failingRuntime.runTest(
        Effect.gen(function* () {
          const service = yield* TaskService;
          return yield* service.list({ status: "pending" });
        }),
      );
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("doomed");
    } finally {
      await failingRuntime.dispose();
    }
  });

  it("requestExecution moves a failed task back to pending and re-enqueues", async () => {
    const requeued = await runtime.runTest(
      Effect.gen(function* () {
        const service = yield* TaskService;
        const task = yield* service.create({ title: "retry me" });
        yield* service.markProcessing(task.id);
        yield* service.markFailed(task.id, "provider exploded");
        return yield* service.requestExecution(task.id);
      }),
    );
    expect(requeued.status).toBe("pending");
    expect(publisher.sent).toHaveLength(2);
  });

  it("cancel only works from pending", async () => {
    const error = await runtime.runTest(
      Effect.gen(function* () {
        const service = yield* TaskService;
        const task = yield* service.create({ title: "busy" });
        yield* service.markProcessing(task.id);
        return yield* service.cancel(task.id).pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("ConflictError");
  });
});
