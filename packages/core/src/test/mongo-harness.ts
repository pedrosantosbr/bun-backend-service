import mongoose from "mongoose";

const testMongoUrl =
  process.env.MONGO_URL ?? "mongodb://127.0.0.1:27018/template-test";

/**
 * Drops the test Mongo database. Opens its own short-lived connection so it
 * can run in beforeEach without touching the suite's scoped connection.
 */
export const clearMongoTestData = async (): Promise<void> => {
  const connection = await mongoose
    .createConnection(testMongoUrl, { serverSelectionTimeoutMS: 2_000 })
    .asPromise()
    .catch((error: unknown) => {
      throw new Error(
        `Cannot reach test Mongo at ${testMongoUrl}. Run \`bun run deps:up\` first. (${String(error)})`,
      );
    });
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
};
