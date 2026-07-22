---
title: Database migrations
description: Drizzle push vs generate, prefixes, and the shared-database rules.
---

## Two workflows

- **Local/dev iteration** — `bun run db:push` (drizzle-kit push) diffs the
  schema files against the database and applies changes directly. Fast, no
  files. This is also what the test harness uses (with `--force`, since
  push prompts on anything interactive).
- **Deployed environments** — `bun run --cwd packages/core db:generate`
  writes SQL migration files to `packages/core/migrations/`, tracked in the
  `tpl_migrations` table. Commit the generated SQL and its
  `meta/` snapshots together, and apply with `db:migrate` during deploys.

## The prefix rules (read before adding tables)

All tables are created through the prefixed creator in
`packages/core/src/db/table.ts`:

```ts
export const pgTable = pgTableCreator((name) => `tpl_${name}`);
```

so the service can share a database instance with others. Three places must
stay in sync — this is the classic drizzle gotcha inherited from platform:

1. the prefix in `db/table.ts`
2. `tablesFilter: ["tpl_*"]` in `drizzle.config.ts` — push only *sees*
   matching tables; a schema table outside the filter looks "new" and
   triggers CREATE TABLE collisions
3. the explicit `schema:` file list in `drizzle.config.ts` — files not
   listed are silently not pushed.

Postgres enums are **not** prefixed by `pgTableCreator` — name them with
the prefix yourself (`pgEnum("tpl_task_status", ...)`).

## Test databases

Integration tests run against `template_test` (never the dev `template`
database), created on demand by `createTestSchema()` in
`packages/core/src/test/pg-harness.ts`. It runs `drizzle-kit push --force`
only when the hash of the schema files changes, storing the hash **in the
database** (`_test_meta`, deliberately outside the `tpl_*` filter) so a
recreated container never reuses a stale marker.

Never hand-write `CREATE TABLE` statements in tests — add the schema file
to `drizzle.config.ts` and let the harness push it.
