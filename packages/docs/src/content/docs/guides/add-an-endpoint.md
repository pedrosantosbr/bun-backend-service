---
title: Add an endpoint
description: zod schema → route → handleEffect → test.
---

Adding `GET /v1/tasks/:id/summary` end to end:

## 1. Define the schemas

In `packages/api/src/schemas/` (zod v4):

```ts
export const TaskIdParams = z.object({ id: z.uuid() });
```

Response shaping is a plain function (`serializeTask`) — dates become ISO
strings, monetary amounts become 2-decimal strings, never raw numbers.

## 2. Write the route

Routes live in `packages/api/src/routes/`. A handler is an Effect program
bridged into Hono by `handleEffect`:

```ts
export const tasksRoutes = new Hono().get(
  "/:id/summary",
  handleEffect((c) =>
    Effect.gen(function* () {
      const { id } = yield* validateParams(c, TaskIdParams);
      const service = yield* TaskService;
      const task = yield* service.get(id);
      return { id: task.id, status: task.status };
    }),
  ),
);
```

- `validateBody` / `validateQuery` / `validateParams` fail with
  `ValidationError` → the envelope maps it to HTTP 400.
- Domain errors flow out of the service typed; `errorToResponse`
  (`packages/api/src/lib/response.ts`) maps tags to statuses
  (`NotFoundError`→404, `ConflictError`→409, `ProviderError`→502, …).
- Success is wrapped as `{ "status": "success", "data": ... }`; pass
  `{ successStatus: 201 }` for creates.

## 3. Mount it

If you created a new route file, mount it in `packages/api/src/app.ts`:

```ts
app.route("/v1/tasks", tasksRoutes);
```

Anything under `/v1/*` sits behind the bearer-auth middleware.

## 4. New service dependency?

If the handler needs a service that isn't in `ApiLayer` yet, add its layer
in `packages/api/src/layers.ts`. The runtime builds the graph once per
process.

## 5. Test it

Add a case to `packages/api/src/app.integration.test.ts` — tests run the
whole stack via `app.request()` against real docker Postgres/Mongo/ElasticMQ:

```ts
it("summarizes a task", async () => {
  const task = await createTask();
  const response = await app.request(`/v1/tasks/${task.id}/summary`);
  expect(response.status).toBe(200);
});
```

Run `bun run check` before pushing.
