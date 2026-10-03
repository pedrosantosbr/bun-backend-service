import {
  Config,
  ConfigProvider,
  Context,
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
  stage: Config.String("STAGE").pipe(Config.withDefault("local")),
  logLevel: Config.String("LOG_LEVEL").pipe(Config.withDefault("info")),
  postgresUrl: Config.String("POSTGRES_URL").pipe(
    Config.withDefault("postgres://postgres:postgres@127.0.0.1:5433/template"),
  ),
  mongoUrl: Config.String("MONGO_URL").pipe(
    Config.withDefault("mongodb://127.0.0.1:27018/template"),
  ),
  taskQueueUrl: Config.String("TASK_QUEUE_URL").pipe(
    Config.withDefault("http://localhost:9324/000000000000/task-execution"),
  ),
  sqsEndpoint: Config.option(Config.String("SQS_ENDPOINT")),
  apiToken: Config.option(Config.Redacted("API_TOKEN")),
  echoProvider: Config.all({
    baseUrl: Config.String("ECHO_PROVIDER_BASE_URL").pipe(
      Config.withDefault("http://localhost:4010"),
    ),
    apiKey: Config.Redacted("ECHO_PROVIDER_API_KEY").pipe(
      Config.withDefault(Redacted.make("local-dev-key")),
    ),
    mode: Config.Literals(["http", "fake"], "ECHO_PROVIDER_MODE").pipe(
      Config.withDefault("fake" as const),
    ),
    timeoutMs: Config.Number("ECHO_PROVIDER_TIMEOUT_MS").pipe(
      Config.withDefault(10_000),
    ),
  }),
});

export type AppConfigType = Config.Success<typeof AppConfig>;

export class AppConfigService extends Context.Service<
  AppConfigService,
  AppConfigType
>()("@template/shared/AppConfigService") {}

export const AppConfigLive = Layer.effect(AppConfigService, AppConfig).pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv())),
);

export const defaultTestConfig: AppConfigType = {
  stage: "test",
  logLevel: "warn",
  postgresUrl: "postgres://postgres:postgres@127.0.0.1:5433/template_test",
  mongoUrl: "mongodb://127.0.0.1:27018/template-test",
  taskQueueUrl: "http://localhost:9324/000000000000/task-execution",
  sqsEndpoint: Option.some("http://localhost:9324"),
  apiToken: Option.none(),
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
