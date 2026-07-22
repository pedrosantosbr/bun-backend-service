---
title: Getting started
description: Clone to running service in five minutes.
---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- Docker (for Postgres, MongoDB and ElasticMQ)

## Run it

```bash
bun install
bun run deps:up        # postgres :5433, mongo :27018, elasticmq :9324
bun run db:push        # push the Drizzle schema to the local dev database
bun run dev            # API on http://localhost:3000
bun run worker         # in a second terminal: the task-executor poller
```

Exercise the flow:

```bash
curl -X POST localhost:3000/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"demo","description":"this is great!"}'

# poll until status becomes "completed" (the worker picked it up)
curl localhost:3000/v1/tasks/<id>

# comment on it (stored in MongoDB)
curl -X POST localhost:3000/v1/tasks/<id>/comments \
  -H 'content-type: application/json' \
  -d '{"author":"you","body":"nice"}'

curl localhost:3000/v1/tasks/<id>/interactions
```

## Verify everything

```bash
bun run check   # typecheck → lint → format → unit → docker up → integration
```

## Adopting the template for a new service

1. Copy the repo (or click "Use this template").
2. Search & replace the `@template/` package scope with your service scope.
3. Rename the `tpl_` table prefix in `packages/core/src/db/table.ts`,
   `drizzle.config.ts` (`tablesFilter`, `migrations.table`) and the test
   harness.
4. Rename the `tasks` domain to your first real domain (see
   [Add a domain](/guides/add-a-domain/)) and delete what you don't need.
5. Update `sst.config.ts` app name and `infra/` resources.
6. Set stage secrets: `bun sst secret set PostgresUrl ... --stage staging`.

## Environment variables

All runtime config is plain env (see `packages/shared/src/config/app-config.ts`).
Local defaults point at docker-compose, so nothing is required for dev. In
deployed stages SST injects them (see `infra/queues.ts`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `STAGE` | `local` | stage name; gates local-only behavior |
| `POSTGRES_URL` | local docker | Drizzle/pg connection string |
| `MONGO_URL` | local docker | mongoose connection string |
| `TASK_QUEUE_URL` | local ElasticMQ | task execution queue |
| `SQS_ENDPOINT` | unset (auto for local/test) | SQS endpoint override |
| `API_TOKEN` | unset (auth disabled) | bearer token for `/v1/*` |
| `ECHO_PROVIDER_MODE` | `fake` | `http` uses the real provider client |
