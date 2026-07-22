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
import { MongoDatabaseLive } from "../../db/mongo/service";
import { clearMongoTestData } from "../../test/mongo-harness";
import { setupTestRuntime, type TestRuntime } from "../../test/runtime";
import { CommentStore, CommentStoreLive } from "./store";

const StoreLayer = CommentStoreLive.pipe(
  Layer.provide(MongoDatabaseLive),
  Layer.provide(makeAppConfigTest()),
);

describe("CommentStore (mongo)", () => {
  let runtime: TestRuntime<CommentStore>;

  beforeAll(() => {
    runtime = setupTestRuntime(StoreLayer);
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  beforeEach(async () => {
    await clearMongoTestData();
  });

  it("adds and lists comments, newest first", async () => {
    const taskId = createId();
    const listed = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* CommentStore;
        yield* store.addComment({ taskId, author: "ana", body: "first" });
        yield* store.addComment({ taskId, author: "bob", body: "second" });
        yield* store.addComment({
          taskId: createId(),
          author: "eve",
          body: "other task",
        });
        return yield* store.listByTaskId(taskId);
      }),
    );
    expect(listed).toHaveLength(2);
    expect(listed.map((c) => c.body)).toEqual(["second", "first"]);
    expect(listed[0]!.id).toBeTruthy();
  });

  it("pages backwards with the before cursor", async () => {
    const taskId = createId();
    const page = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* CommentStore;
        for (let i = 0; i < 5; i++) {
          yield* store.addComment({ taskId, author: "ana", body: `c${i}` });
        }
        const first = yield* store.listByTaskId(taskId, { limit: 2 });
        const rest = yield* store.listByTaskId(taskId, {
          limit: 10,
          before: first.at(-1)!.createdAt,
        });
        return { first, rest };
      }),
    );
    expect(page.first).toHaveLength(2);
    expect(page.rest.length).toBeGreaterThanOrEqual(1);
    const ids = new Set([...page.first, ...page.rest].map((c) => c.id));
    expect(ids.size).toBe(page.first.length + page.rest.length);
  });

  it("records and lists interactions in chronological order", async () => {
    const taskId = createId();
    const interactions = await runtime.runTest(
      Effect.gen(function* () {
        const store = yield* CommentStore;
        yield* store.recordInteraction({ taskId, kind: "created" });
        yield* store.recordInteraction({
          taskId,
          kind: "completed",
          detail: { echoed: "ok" },
        });
        return yield* store.listInteractions(taskId);
      }),
    );
    expect(interactions.map((i) => i.kind)).toEqual(["created", "completed"]);
    expect(interactions[1]!.detail).toEqual({ echoed: "ok" });
  });
});
