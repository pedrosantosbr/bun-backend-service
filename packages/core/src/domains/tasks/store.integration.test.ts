import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { makeAppConfigTest } from "@template/shared/config";
import { createId } from "@template/shared/ids";
import { Effect, Layer } from "effect";
import { PostgresDatabaseLive } from "../../db/postgres/service";
import { clearTestData, createTestSchema } from "../../test/pg-harness";
import { setupTestRuntime, type TestRuntime } from "../../test/runtime";
import { TaskStore, TaskStoreLive } from "./store";

const StoreLayer = TaskStoreLive.pipe(
  Layer.provide(PostgresDatabaseLive),
  Layer.provide(makeAppConfigTest()),
);

describe("TaskStore (postgres)", () => {
  let runtime: TestRuntime<TaskStore>;

  beforeAll(async () => {
    await createTestSchema();
    runtime = setupTestRuntime(StoreLayer);
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  const insertTask = (overrides: { title?: string } = {}) =>
    runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.insert({
          id: createId(),
          title: overrides.title ?? "test task",
        });
      }),
    );

  it("inserts and finds a task", async () => {
    const created = await insertTask({ title: "hello" });
    expect(created.status).toBe("pending");
    expect(created.attemptCount).toBe(0);

    const found = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.findById(created.id);
      }),
    );
    expect(found.title).toBe("hello");
  });

  it("fails with NotFoundError for a missing task", async () => {
    const error = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.findById(createId()).pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("NotFoundError");
  });

  it("walks the happy-path state machine and stamps timestamps", async () => {
    const created = await insertTask();
    const done = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        const processing = yield* store.transition(created.id, "processing", {
          startedAt: new Date(),
          incrementAttempts: true,
        });
        expect(processing.status).toBe("processing");
        expect(processing.attemptCount).toBe(1);
        expect(processing.startedAt).not.toBeNull();
        return yield* store.transition(created.id, "completed", {
          result: { echoed: "ok" },
          completedAt: new Date(),
        });
      }),
    );
    expect(done.status).toBe("completed");
    expect(done.result).toEqual({ echoed: "ok" });
    expect(done.completedAt).not.toBeNull();
  });

  it("rejects illegal transitions with ConflictError", async () => {
    const created = await insertTask();
    const error = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        yield* store.transition(created.id, "processing");
        yield* store.transition(created.id, "completed");
        return yield* store
          .transition(created.id, "processing")
          .pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("ConflictError");
  });

  it("transition on a missing task fails with NotFoundError", async () => {
    const error = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store
          .transition(createId(), "processing")
          .pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("NotFoundError");
  });

  it("lists with status filter and cursor pagination", async () => {
    for (let i = 0; i < 5; i++) await insertTask({ title: `task ${i}` });
    const page = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.list({ status: "pending", limit: 3 });
      }),
    );
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();

    const rest = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.list({
          status: "pending",
          limit: 3,
          cursor: page.nextCursor ?? "",
        });
      }),
    );
    expect(rest.items).toHaveLength(2);
    expect(rest.nextCursor).toBeNull();
    const ids = new Set([...page.items, ...rest.items].map((t) => t.id));
    expect(ids.size).toBe(5);
  });

  it("finds only stale processing tasks", async () => {
    const stale = await insertTask({ title: "stale" });
    const fresh = await insertTask({ title: "fresh" });
    await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        yield* store.transition(stale.id, "processing");
        yield* store.transition(fresh.id, "processing");
      }),
    );
    const inFuture = new Date(Date.now() + 60_000);
    const inPast = new Date(Date.now() - 60_000);
    const all = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.findStuckProcessing(inFuture, 10);
      }),
    );
    expect(all.map((t) => t.id).sort()).toEqual([stale.id, fresh.id].sort());
    const none = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* TaskStore;
        return yield* store.findStuckProcessing(inPast, 10);
      }),
    );
    expect(none).toHaveLength(0);
  });
});
