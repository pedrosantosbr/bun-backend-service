import * as tasksSchema from "../../domains/tasks/db/schema/tasks.sql";

/**
 * Aggregated Drizzle schema for the typed database client. Spread each new
 * domain's schema module here (and list its file in drizzle.config.ts).
 */
export const schema = {
  ...tasksSchema,
};

export type DatabaseSchema = typeof schema;
