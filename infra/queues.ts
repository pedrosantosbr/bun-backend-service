import { echoProviderApiKey, mongoUrl, postgresUrl } from "./secrets";

export const taskDlq = new sst.aws.Queue("TaskDlq");

export const taskQueue = new sst.aws.Queue("TaskQueue", {
  dlq: { queue: taskDlq.arn, retry: 3 },
  visibilityTimeout: "60 seconds",
});

/**
 * Runtime config is injected as plain env vars — application code never
 * imports SST's Resource, so local dev, tests and Lambda share one config
 * path (see packages/shared/src/config/app-config.ts).
 */
export const runtimeEnvironment = {
  STAGE: $app.stage,
  POSTGRES_URL: postgresUrl.value,
  MONGO_URL: mongoUrl.value,
  TASK_QUEUE_URL: taskQueue.url,
  ECHO_PROVIDER_API_KEY: echoProviderApiKey.value,
  ECHO_PROVIDER_MODE: "http",
};

taskQueue.subscribe(
  {
    handler: "packages/functions/src/workers/task-executor.handler",
    runtime: "nodejs22.x",
    timeout: "60 seconds",
    environment: runtimeEnvironment,
  },
  { batch: { size: 10, partialResponses: true } },
);
