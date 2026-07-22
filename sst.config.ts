/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 entrypoint. Infra is split into modules under infra/ (platform
 * pattern): secrets, queues, api, cron. This file (and infra/) are excluded
 * from the root tsconfig — run `bun run typecheck:infra` after the first
 * `bun sst dev`/`deploy` has generated .sst/platform.
 */
export default $config({
  app(input) {
    return {
      name: "backend-template",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    await import("./infra/secrets");
    await import("./infra/queues");
    await import("./infra/api");
    await import("./infra/cron");
  },
});
