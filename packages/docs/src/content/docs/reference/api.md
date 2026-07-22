---
title: API reference
description: Routes, envelope and status mapping.
---

## Response envelope

Every endpoint returns:

```json
{ "status": "success", "data": { } }
{ "status": "failure", "error": { "code": "NOT_FOUND", "message": "..." } }
```

| Error tag | HTTP | code |
| --- | --- | --- |
| ValidationError | 400 | `VALIDATION_ERROR` |
| UnauthorizedError | 401 | `UNAUTHORIZED` |
| NotFoundError | 404 | `NOT_FOUND` |
| ConflictError | 409 | `CONFLICT` |
| ProviderError | 502 | `UPSTREAM_ERROR` |
| TimeoutError | 504 | `TIMEOUT` |
| anything else | 500 | `INTERNAL_ERROR` (details only in logs) |

Auth: when `API_TOKEN` is set, `/v1/*` requires `Authorization: Bearer
<token>`. Requests may pass `x-request-id` / `x-correlation-id`; the
request id is echoed back and both propagate to downstream calls.

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | pg + mongo component status |
| POST | `/v1/tasks` | create + auto-enqueue execution → 201 |
| GET | `/v1/tasks` | `?status=&limit=&cursor=` (cursor = last task id) |
| GET | `/v1/tasks/:id` | task + 20 latest comments (pg + mongo composed) |
| POST | `/v1/tasks/:id/execute` | re-enqueue; failed → pending → 202 |
| POST | `/v1/tasks/:id/cancel` | pending only, else 409 |
| GET | `/v1/tasks/:id/comments` | `?limit=&before=` (ISO timestamp) |
| POST | `/v1/tasks/:id/comments` | `{author, body}` → 201 |
| GET | `/v1/tasks/:id/interactions` | audit trail (created/processing/…) |

## Task lifecycle

```
pending ──► processing ──► completed
   │             │
   │             └──► failed ──► pending (POST /execute or cron retry)
   └──► cancelled
```

Transitions are enforced atomically in the store
(`UPDATE ... WHERE status IN (...)`); illegal ones return `CONFLICT`.
