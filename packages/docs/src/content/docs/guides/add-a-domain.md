---
title: Add a domain
description: The anatomy of packages/core/src/domains/<name>.
---

A domain owns its schema, storage access and business rules. Copy the shape
of `packages/core/src/domains/tasks/`:

```
domains/<name>/
├── db/schema/<name>.sql.ts   # Drizzle tables (Postgres domains)
├── db/models.ts              # mongoose models (Mongo domains)
├── types.ts                  # domain types, state machines, pure logic
├── store.ts                  # repository: Context.Tag + Layer, one class of
│                             #   tagged error per backend (DatabaseQueryError…)
├── <name>-service.ts         # business orchestration over the store(s)
├── layers.ts                 # the domain's composed public layer
└── index.ts                  # explicit named re-exports (no export *)
```

## Postgres domains

1. Create the schema file with the shared `pgTable` creator so tables get
   the service prefix:

   ```ts
   import { pgTable } from "../../../../db/table";
   export const invoices = pgTable("invoices", { /* columns */ });
   ```

2. Register it in **two** places (this is a real platform gotcha):
   - spread into the schema map in `packages/core/src/db/postgres/schema.ts`
   - add the file path to the `schema` array in
     `packages/core/drizzle.config.ts` (explicit list, not a glob).
3. Push locally with `bun run db:push`. The prefix must stay covered by
   `tablesFilter` or drizzle-kit will try to recreate other tables.

## Mongo domains

Define schemas in `db/models.ts` and register them **per connection**
(`connection.models.X ?? connection.model(...)`), never on the mongoose
global — see `domains/comments/db/models.ts`. Wrap every call in
`runMongo(...)` so failures surface as `MongoQueryError`.

## Store vs service

- The **store** is dumb: CRUD, typed errors, no cross-domain calls. Guarded
  writes (`UPDATE ... WHERE status IN (...) RETURNING`) belong here so
  invariants hold under concurrency — see `TaskStore.transition`.
- The **service** composes stores, the queue publisher and config into use
  cases, and is what routes/workers depend on.

## Wire and test

- Add the domain's layer to `packages/api/src/layers.ts` and/or
  `packages/functions/src/layers.ts`.
- Write `store.integration.test.ts` against the real docker DB using
  `createTestSchema()` / `clearTestData()` / `setupTestRuntime()` from
  `packages/core/src/test/`. Do not mock internal code.
