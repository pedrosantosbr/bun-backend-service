import { runtimeEnvironment } from "./queues";
import { apiToken } from "./secrets";

export const api = new sst.aws.Function("Api", {
  handler: "packages/api/src/index.handler",
  runtime: "nodejs22.x",
  url: true,
  timeout: "30 seconds",
  environment: {
    ...runtimeEnvironment,
    API_TOKEN: apiToken.value,
  },
});
