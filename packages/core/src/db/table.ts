import { pgTableCreator } from "drizzle-orm/pg-core";

/**
 * All Postgres tables are prefixed so multiple services can share one
 * database instance. Rename `tpl_` when adopting the template (see README).
 */
export const pgTable = pgTableCreator((name) => `tpl_${name}`);
