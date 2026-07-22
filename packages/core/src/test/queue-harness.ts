import {
  DeleteMessageCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export const testQueueUrl: string =
  process.env.TASK_QUEUE_URL ??
  "http://localhost:9324/000000000000/task-execution";

export const makeTestSqsClient = (): SQSClient =>
  new SQSClient({
    endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:9324",
    region: "us-east-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });

export const purgeQueue = async (
  client: SQSClient,
  queueUrl: string = testQueueUrl,
): Promise<void> => {
  await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
};

/** Drains up to `max` messages (deleting them) and returns their bodies. */
export const receiveMessageBodies = async (
  client: SQSClient,
  queueUrl: string = testQueueUrl,
  max = 10,
): Promise<string[]> => {
  const bodies: string[] = [];
  while (bodies.length < max) {
    const output = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: Math.min(10, max - bodies.length),
        WaitTimeSeconds: 1,
      }),
    );
    const messages = output.Messages ?? [];
    if (messages.length === 0) break;
    for (const message of messages) {
      if (message.Body !== undefined) bodies.push(message.Body);
      if (message.ReceiptHandle) {
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    }
  }
  return bodies;
};
