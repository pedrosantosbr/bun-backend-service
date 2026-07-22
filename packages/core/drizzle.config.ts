import { defineConfig } from "drizzle-kit";

// Explicit file list on purpose: only schemas listed here are pushed.
// When adding a new domain schema, add its path AND make sure its table
// prefix is covered by tablesFilter below.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/domains/tasks/db/schema/tasks.sql.ts"],
  out: "./migrations",
  migrations: {
    table: "tpl_migrations",
    schema: "public",
  },
  tablesFilter: ["tpl_*"],
  dbCredentials: {
    url:
      process.env.POSTGRES_URL ??
      "postgres://postgres:postgres@127.0.0.1:5433/template",
  },
});
