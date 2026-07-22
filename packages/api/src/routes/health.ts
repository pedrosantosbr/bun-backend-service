import {
  MongoDatabaseService,
  runMongo,
} from "@template/core/db/mongo/service";
import {
  PostgresDatabaseService,
  runQuery,
} from "@template/core/db/postgres/service";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { Hono } from "hono";
import { handleEffect } from "../lib/handle-effect";

const componentStatus = <E>(check: Effect.Effect<unknown, E>) =>
  check.pipe(
    Effect.as("healthy" as const),
    Effect.orElseSucceed(() => "unhealthy" as const),
  );

export const healthRoutes = new Hono().get(
  "/",
  handleEffect((_c) =>
    Effect.gen(function* () {
      const { db } = yield* PostgresDatabaseService;
      const { connection } = yield* MongoDatabaseService;
      const [postgres, mongo] = yield* Effect.all(
        [
          componentStatus(
            runQuery("health.postgres", () => db.execute(sql`SELECT 1`)),
          ),
          componentStatus(
            runMongo("health.mongo", () => connection.db!.admin().ping()),
          ),
        ],
        { concurrency: 2 },
      );
      return { postgres, mongo };
    }),
  ),
);
