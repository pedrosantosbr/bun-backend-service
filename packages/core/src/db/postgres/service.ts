import { AppConfigService } from "@template/shared/config";
import { DatabaseQueryError } from "@template/shared/errors";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";
import pg from "pg";
import { schema } from "./schema";

export interface PostgresDatabase {
  readonly db: NodePgDatabase<typeof schema>;
  readonly pool: pg.Pool;
}

export class PostgresDatabaseService extends Context.Tag(
  "@template/core/PostgresDatabaseService",
)<PostgresDatabaseService, PostgresDatabase>() {}

const isLambdaRuntime = (): boolean =>
  process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

const makeClient = (connectionString: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const pool = new pg.Pool({
        connectionString,
        ...(isLambdaRuntime() ? { max: 2 } : {}),
      });
      return { db: drizzle({ client: pool, schema }), pool };
    }),
    (client) =>
      Effect.tryPromise({
        try: () => client.pool.end(),
        catch: (cause) =>
          new DatabaseQueryError({
            message: "failed to close postgres pool",
            operation: "pool.end",
            cause,
          }),
      }).pipe(Effect.ignore),
  );

export const PostgresDatabaseLive = Layer.scoped(
  PostgresDatabaseService,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return yield* makeClient(config.postgresUrl);
  }),
);

/** Wraps a Drizzle promise in the typed error channel. */
export const runQuery = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, DatabaseQueryError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new DatabaseQueryError({
        message: cause instanceof Error ? cause.message : String(cause),
        operation,
        cause,
      }),
  });
