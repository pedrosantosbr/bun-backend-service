# backend-nodejs-template

A production-shaped template for new backend services, capturing the
patterns we use today across the platform and liabilities repos:

- **Bun workspaces** monorepo, raw-TS packages, `catalog:` pinned versions
- **Effect TS 4** — Context.Service services, Layers, `Schema.TaggedError` errors
- **Hono** HTTP API (Bun dev server ⇄ AWS Lambda, same app)
- **Postgres via Drizzle** (prefixed tables, push + generated migrations)
- **MongoDB via mongoose** (scoped connections, per-connection models)
- **SQS workers** with partial batch failure, tested locally on ElasticMQ
- **SST v3** infra scaffolding (`infra/`), config via plain env vars
- **Integration-first tests** against real Docker deps
- **Starlight docs** (`packages/docs`) with how-to guides

Everything is demonstrated by one example domain — **tasks**: a REST API,
a background executor worker calling a (fake-able) external provider, task
rows in Postgres, comments + audit trail in MongoDB, and a requeue cron.

## Quickstart

```bash
bun install
bun run deps:up      # docker: postgres :5433, mongo :27018, elasticmq :9324
bun run db:push      # push schema to the local dev database
bun run dev          # API on :3000
bun run worker       # task-executor poller (second terminal)

curl -X POST localhost:3000/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"demo","description":"this is great!"}'
```

Verify everything: `bun run check` (typecheck → lint → format → unit →
docker up → integration). Docs: `bun run docs:dev`.

## Layout

```
packages/
  shared/      errors, config, request metadata, ids     (imports nothing)
  services/    external provider clients (EchoProvider)  (imports shared)
  core/        domains, pg/mongo/queue services, tests   (imports shared+services)
  api/         Hono routes + Effect bridge               (imports everything)
  functions/   SQS workers + crons                       (imports everything)
  docs/        Starlight site (isolated toolchain)
infra/         SST v3 resources (queue, api fn, cron, secrets)
scripts/       check runner, local worker poller, wait-for-deps
```

Import direction is enforced by oxlint. See the docs site for the full
architecture and guides (add an endpoint / domain / worker / cron /
provider, migrations, testing).

## Adopting for a new service

1. Search & replace the `@template/` scope with your service scope.
2. Rename the `tpl_` prefix (`packages/core/src/db/table.ts`,
   `drizzle.config.ts` `tablesFilter` + `migrations.table`, test harness).
3. Replace the `tasks`/`comments` example domains with your first real one.
4. Rename the SST app (`sst.config.ts`) and adjust `infra/`.
5. Set stage secrets: `bun sst secret set PostgresUrl ... --stage <stage>`.

See `SELF_ASSESSMENT.md` for an honest scoring of the template and the
known gaps (outbox, OpenAPI generation, tracing, real auth).
