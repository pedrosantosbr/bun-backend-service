/**
 * Preloaded by `bun test` (see bunfig.toml). Sets deterministic env defaults
 * so unit tests never pick up a developer's shell environment. Integration
 * tests additionally verify their docker dependency is reachable via the
 * harnesses in ./test/.
 */
process.env.STAGE = "test";
process.env.LOG_LEVEL ??= "warn";
process.env.POSTGRES_URL ??=
  "postgres://postgres:postgres@127.0.0.1:5433/template";
process.env.MONGO_URL ??= "mongodb://127.0.0.1:27018/template-test";
process.env.TASK_QUEUE_URL ??=
  "http://localhost:9324/000000000000/task-execution";
process.env.SQS_ENDPOINT ??= "http://localhost:9324";
process.env.ECHO_PROVIDER_MODE ??= "fake";
process.env.AWS_REGION ??= "us-east-1";
