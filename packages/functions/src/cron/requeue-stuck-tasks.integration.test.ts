import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { PostgresDatabaseLive } from "@template/core/db/postgres/service";
import { TasksLayer } from "@template/core/domains/tasks/layers";
import { TaskStore } from "@template/core/domains/tasks/store";
import { SqsQueuePublisherLive } from "@template/core/queue/sqs-queue-publisher";
import {
  clearTestData,
  createTestSchema,
  executeTestSql,
} from "@template/core/test/pg-harness";
import {
  makeTestSqsClient,
  purgeQueue,
  receiveMessageBodies,
} from "@template/core/test/queue-harness";
import {
  setupTestRuntime,
  type TestRuntime,
} from "@template/core/test/runtime";
import { makeAppConfigTest } from "@template/shared/config";
import { createId } from "@template/shared/ids";
import { Effect, Layer } from "effect";
import { requeueStuckTasks } from "./requeue-stuck-tasks";

const CronTestLayer = TasksLayer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(PostgresDatabaseLive, SqsQueuePublisherLive).pipe(
      Layer.provideMerge(makeAppConfigTest()),
    ),
  ),
);

describe("requeue-stuck-tasks cron", () => {
  let runtime: TestRuntime<Effect.Effect.Context<typeof requeueStuckTasks>>;
  let sqs: SQSClient;

  beforeAll(async () => {
    await createTestSchema();
    runtime = setupTestRuntime(CronTestLayer);
    sqs = makeTestSqsClient();
  });

  afterAll(async () => {
    await runtime.dispose();
    sqs.destroy();
  });

  beforeEach(async () => {
    await clearTestData();
    await purgeQueue(sqs);
  });

  const insertProcessingTask = async (options: {
    attemptCount: number;
    minutesAgo: number;
  }) => {
    const task = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        const created = yield* store.insert({
          id: createId(),
          title: "stuck candidate",
        });
        return yield* store.transition(created.id, "processing");
      }),
    );
    await executeTestSql(
      `UPDATE tpl_tasks
       SET updated_at = now() - ($2::int * interval '1 minute'),
           attempt_count = $3
       WHERE id = $1`,
      [task.id, options.minutesAgo, options.attemptCount],
    );
    return task;
  };

  const getStatus = (id: string) =>
    runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return (yield* store.findById(id)).status;
      }),
    );

  it("requeues stale processing tasks and leaves fresh ones alone", async () => {
    const stale = await insertProcessingTask({
      attemptCount: 1,
      minutesAgo: 30,
    });
    const fresh = await insertProcessingTask({
      attemptCount: 1,
      minutesAgo: 1,
    });

    const summary = await runtime.runTest(requeueStuckTasks);
    expect(summary).toEqual({ requeued: 1, failed: 0 });

    expect(await getStatus(stale.id)).toBe("pending");
    expect(await getStatus(fresh.id)).toBe("processing");

    const bodies = await receiveMessageBodies(sqs);
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!)).toEqual({
      type: "task.execute",
      taskId: stale.id,
    });
  });

  it("fails tasks that exhausted their attempts", async () => {
    const exhausted = await insertProcessingTask({
      attemptCount: 3,
      minutesAgo: 30,
    });

    const summary = await runtime.runTest(requeueStuckTasks);
    expect(summary).toEqual({ requeued: 0, failed: 1 });
    expect(await getStatus(exhausted.id)).toBe("failed");
    expect(await receiveMessageBodies(sqs)).toHaveLength(0);
  });

  it("does nothing when no tasks are stuck", async () => {
    const summary = await runtime.runTest(requeueStuckTasks);
    expect(summary).toEqual({ requeued: 0, failed: 0 });
  });
});
