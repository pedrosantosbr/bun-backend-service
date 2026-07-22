import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { makeAppConfigTest } from "@template/shared/config";
import { Effect, Layer } from "effect";
import {
  makeTestSqsClient,
  purgeQueue,
  receiveMessageBodies,
  testQueueUrl,
} from "../test/queue-harness";
import { setupTestRuntime, type TestRuntime } from "../test/runtime";
import { QueuePublisher } from "./queue-publisher";
import { SqsQueuePublisherLive } from "./sqs-queue-publisher";

const PublisherLayer = SqsQueuePublisherLive.pipe(
  Layer.provide(makeAppConfigTest()),
);

describe("SqsQueuePublisher (elasticmq)", () => {
  let runtime: TestRuntime<QueuePublisher>;
  let sqs: SQSClient;

  beforeAll(() => {
    runtime = setupTestRuntime(PublisherLayer);
    sqs = makeTestSqsClient();
  });

  afterAll(async () => {
    await runtime.dispose();
    sqs.destroy();
  });

  beforeEach(async () => {
    await purgeQueue(sqs);
  });

  it("sends a single message that can be received back", async () => {
    const { messageId } = await runtime.runTest(
      Effect.gen(function* () {
        const publisher = yield* QueuePublisher;
        return yield* publisher.send(testQueueUrl, { body: '{"hello":1}' });
      }),
    );
    expect(messageId).not.toBe("unknown");
    const bodies = await receiveMessageBodies(sqs);
    expect(bodies).toEqual(['{"hello":1}']);
  });

  it("sendBatch chunks past the SQS batch limit of 10", async () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      body: JSON.stringify({ n: i }),
    }));
    const result = await runtime.runTest(
      Effect.gen(function* () {
        const publisher = yield* QueuePublisher;
        return yield* publisher.sendBatch(testQueueUrl, messages);
      }),
    );
    expect(result.successCount).toBe(12);
    expect(result.failedCount).toBe(0);
    const bodies = await receiveMessageBodies(sqs, testQueueUrl, 12);
    expect(bodies).toHaveLength(12);
    const numbers = bodies
      .map((b) => (JSON.parse(b) as { n: number }).n)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("fails with QueueError for a nonexistent queue", async () => {
    const error = await runtime.runTest(
      Effect.gen(function* () {
        const publisher = yield* QueuePublisher;
        return yield* publisher
          .send("http://localhost:9324/000000000000/does-not-exist", {
            body: "x",
          })
          .pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("QueueError");
  });
});
