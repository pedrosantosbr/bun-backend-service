---
title: Overview
description: What this template is and how it fits together.
---

`backend-nodejs-template` is the starting point for new backend services. It is a Bun workspace monorepo using **Effect TS**, **Hono**, **Drizzle/Postgres**, **mongoose/MongoDB**, **SQS workers** and **SST v3**, mirroring the patterns used in the platform and liabilities repos.

## The example domain: tasks

Everything in the template is demonstrated through one end-to-end feature:

1. `POST /v1/tasks` inserts a row in **Postgres** and enqueues a `task.execute` message on **SQS** (ElasticMQ locally).
2. The **task-executor worker** claims the task (`pending → processing`), calls the external **EchoProvider**, and records the outcome (`completed`/`failed`).
3. Comments and an interaction audit trail live in **MongoDB**; `GET /v1/tasks/:id` composes the Postgres row with the Mongo comments in one response.
4. A **cron** requeues tasks stuck in `processing` and fails ones that exhausted their attempts.

## Package layout

| Package | Role | May import |
| --- | --- | --- |
| `@template/shared` | errors, config, request metadata, ids | — |
| `@template/services` | HTTP clients for external providers | shared |
| `@template/core` | domains, Postgres/Mongo/queue services | shared, services |
| `@template/api` | Hono HTTP API | everything |
| `@template/functions` | Lambda workers + crons | everything |

The import direction is enforced by oxlint (`.oxlintrc.json`) — violating it fails `bun run check`.

## Where to go next

- [Getting started](/getting-started/) — clone to running in five minutes
- [Layers & boundaries](/architecture/layers/) — why the packages are shaped this way
- [Effect patterns](/architecture/effect-patterns/) — the service/layer/error conventions
- The guides in the sidebar walk through every "how do I add X?" question.
