import { runtimeEnvironment } from "./queues";

export const requeueStuckTasks = new sst.aws.Cron("RequeueStuckTasks", {
  schedule: "rate(15 minutes)",
  function: {
    handler: "packages/functions/src/cron/requeue-stuck-tasks.handler",
    runtime: "nodejs22.x",
    timeout: "120 seconds",
    environment: runtimeEnvironment,
  },
});
