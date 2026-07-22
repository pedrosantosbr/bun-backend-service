import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
} from "effect";

/**
 * All runtime configuration comes from plain environment variables.
 * Deployed Lambdas get them injected by SST (see infra/), local dev and
 * tests fall back to the docker-compose defaults below. Application code
 * never reads process.env or SST Resource directly.
 */
const AppConfig = Config.all({
  stage: Config.string("STAGE").pipe(Config.withDefault("local")),
  logLevel: Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
  postgresUrl: Config.string("POSTGRES_URL").pipe(
    Config.withDefault("postgres://postgres:postgres@127.0.0.1:5433/template"),
  ),
  mongoUrl: Config.string("MONGO_URL").pipe(
    Config.withDefault("mongodb://127.0.0.1:27018/template"),
  ),
  taskQueueUrl: Config.string("TASK_QUEUE_URL").pipe(
    Config.withDefault("http://localhost:9324/000000000000/task-execution"),
  ),
  sqsEndpoint: Config.option(Config.string("SQS_ENDPOINT")),
  echoProvider: Config.all({
    baseUrl: Config.string("ECHO_PROVIDER_BASE_URL").pipe(
      Config.withDefault("http://localhost:4010"),
    ),
    apiKey: Config.redacted("ECHO_PROVIDER_API_KEY").pipe(
      Config.withDefault(Redacted.make("local-dev-key")),
    ),
    mode: Config.literal(
      "http",
      "fake",
    )("ECHO_PROVIDER_MODE").pipe(Config.withDefault("fake" as const)),
    timeoutMs: Config.number("ECHO_PROVIDER_TIMEOUT_MS").pipe(
      Config.withDefault(10_000),
    ),
  }),
});

export type AppConfigType = Effect.Effect.Success<typeof AppConfig>;

export class AppConfigService extends Context.Tag(
  "@template/shared/AppConfigService",
)<AppConfigService, AppConfigType>() {}

export const AppConfigLive = Layer.effect(AppConfigService, AppConfig).pipe(
  Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
);

export const defaultTestConfig: AppConfigType = {
  stage: "test",
  logLevel: "warn",
  postgresUrl: "postgres://postgres:postgres@127.0.0.1:5433/template",
  mongoUrl: "mongodb://127.0.0.1:27018/template-test",
  taskQueueUrl: "http://localhost:9324/000000000000/task-execution",
  sqsEndpoint: Option.some("http://localhost:9324"),
  echoProvider: {
    baseUrl: "http://localhost:4010",
    apiKey: Redacted.make("test-key"),
    mode: "fake",
    timeoutMs: 2_000,
  },
};

export const makeAppConfigTest = (
  overrides: Partial<AppConfigType> = {},
): Layer.Layer<AppConfigService> =>
  Layer.succeed(AppConfigService, { ...defaultTestConfig, ...overrides });
