import { AppConfigService } from "@template/shared/config";
import { MongoQueryError } from "@template/shared/errors";
import { Context, Effect, Layer } from "effect";
import mongoose from "mongoose";

export interface MongoDatabase {
  readonly connection: mongoose.Connection;
}

export class MongoDatabaseService extends Context.Service<
  MongoDatabaseService,
  MongoDatabase
>()("@template/core/MongoDatabaseService") {}

/**
 * A scoped mongoose connection. Always uses createConnection (never the
 * mongoose global) so runtimes and tests can open/close cleanly; models are
 * registered per-connection in each domain's models file.
 */
export const MongoDatabaseLive = Layer.effect(
  MongoDatabaseService,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const connection = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          mongoose
            .createConnection(config.mongoUrl, {
              serverSelectionTimeoutMS:
                config.stage === "test" ? 2_000 : 10_000,
            })
            .asPromise(),
        catch: (cause) =>
          new MongoQueryError({
            message: `failed to connect to mongo: ${String(cause)}`,
            operation: "createConnection",
            cause,
          }),
      }),
      (conn) =>
        Effect.tryPromise({
          try: () => conn.close(),
          catch: (cause) =>
            new MongoQueryError({
              message: "failed to close mongo connection",
              operation: "connection.close",
              cause,
            }),
        }).pipe(Effect.ignore),
    );
    return { connection };
  }),
);

/** Wraps a mongoose promise in the typed error channel. */
export const runMongo = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, MongoQueryError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new MongoQueryError({
        message: cause instanceof Error ? cause.message : String(cause),
        operation,
        cause,
      }),
  });
