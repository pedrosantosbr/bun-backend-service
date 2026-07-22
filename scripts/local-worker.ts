import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { makeSqsEvent } from "@template/functions/lib/sqs";
import { handler } from "@template/functions/workers/task-executor";

/**
 * Local dev worker (`bun run worker`): long-polls ElasticMQ and feeds
 * batches through the EXACT production Lambda handler. Messages whose
 * records land in batchItemFailures are left on the queue for redelivery,
 * mirroring SQS partial-batch behavior.
 */
const queueUrl =
  process.env.TASK_QUEUE_URL ??
  "http://localhost:9324/000000000000/task-execution";
const endpoint = process.env.SQS_ENDPOINT ?? "http://localhost:9324";

const sqs = new SQSClient({
  endpoint,
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

console.log(`worker polling ${queueUrl}`);

let running = true;
process.on("SIGINT", () => {
  running = false;
});

while (running) {
  const output = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 10,
    }),
  );
  const messages = output.Messages ?? [];
  if (messages.length === 0) continue;

  const event = makeSqsEvent(
    messages.map((message) => ({
      messageId: message.MessageId ?? "unknown",
      body: message.Body ?? "",
    })),
  );
  const { batchItemFailures } = await handler(event);
  const failedIds = new Set(batchItemFailures.map((f) => f.itemIdentifier));

  for (const message of messages) {
    if (failedIds.has(message.MessageId ?? "")) {
      console.warn(`message ${message.MessageId} failed, leaving for retry`);
      continue;
    }
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }
  console.log(
    `processed batch of ${messages.length} (${failedIds.size} failed)`,
  );
}

await handler.dispose();
sqs.destroy();
