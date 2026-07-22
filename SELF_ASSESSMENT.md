# Template self-assessment

An honest scoring of this template against the criteria it was built for,
based on what is actually in the repo (not what is aspired to). Scale 1–5.

## Scores

### Maintainability — 4 / 5

**For:**

- Strict, lint-enforced layer boundaries (`shared ← services ← core ←
api/functions`) make dependency direction a build failure instead of a
  review argument.
- One convention everywhere: interface + `Context.Tag` + Layer; tagged
  errors in one shared module; every Promise wrapped through `runQuery` /
  `runMongo` / `trySqs` helpers. A reader who has seen one domain has seen
  them all.
- Integration-first tests (38, plus 13 unit) run the real stack — schema drift,
  serialization bugs and state-machine races fail tests, not production.
- Single `bun run check` gate; oxfmt/lefthook keep diffs mechanical.

**Against:**

- Effect TS has a real learning curve; maintainability is high _for teams
  already fluent in it_ (which Spritz is), lower for newcomers — mitigated
  but not removed by the docs site.
- `errorToResponse` switches on `_tag` strings rather than sharing types
  with `@template/shared` (a pragmatic cast at the boundary).

### Flexibility — 4 / 5

**For:**

- Delivery mechanisms are adapters: the same Hono app serves Bun locally
  and Lambda in prod; the same SQS handler runs under Lambda and the local
  poller. Swapping API Gateway for ALB, or ElasticMQ for real SQS, touches
  only config/infra.
- Implementations swap by Layer: fake vs HTTP provider is a config flag;
  tests swap the entire API runtime through one seam (`setApiRuntime`).
- Config is plain env vars — no SST coupling in runtime code, so the same
  artifacts run in docker, Lambda, or bare Bun.
- Polyglot persistence is demonstrated concretely (pg + mongo composed in
  one route) without coupling the stores to each other.

**Against:**

- The queue abstraction covers publishing well, but consumers are
  SQS-shaped (`SQSEvent` types); moving to Kafka/EventBridge pipes would
  mean rewriting the handler factory, not just a Layer.
- Only one bounded context exists; multi-domain composition patterns
  (cross-domain transactions, domain events between contexts) are described
  in docs but not exercised in code.

### DDD — 3.5 / 5

**For:**

- Clear bounded-context layout (`domains/tasks`, `domains/comments`), each
  owning schema, storage and rules; ubiquitous language in code and API.
- A real, atomically-enforced aggregate invariant: the task state machine
  lives in `transitionSources` and is enforced in one place
  (`UPDATE ... WHERE status IN (...)`), not sprinkled through callers.
- Domain services separated from repositories; delivery layers contain no
  business rules.

**Against:**

- Entities are Drizzle row types rather than rich domain objects; behavior
  lives in services (transaction-script style, like the source repos) —
  fine at this scale, but it is not tactical-DDD-with-aggregates.
- Domain events are represented only as queue messages + interaction
  records; there is no in-process event mechanism or outbox, so "task
  completed" reactions couple to the worker.
- No value objects (ids and titles are plain strings past validation).

### Clean architecture — 4 / 5

**For:**

- The dependency rule holds and is machine-enforced: domain logic depends
  on abstractions (`QueuePublisher`, `EchoProvider`), and concrete adapters
  (SQS, HTTP, fake) are injected at the composition roots
  (`api/layers.ts`, `functions/layers.ts`).
- Frameworks stay at the edges — Hono types never enter `core`; SST never
  enters runtime code; mongoose/drizzle are confined to stores.
- Boundaries validate in both directions: zod at the HTTP edge, Effect
  Schema on queue messages and provider responses.

**Against:**

- `core` imports `drizzle-orm`/`mongoose` types directly rather than fully
  abstract gateways — a deliberate pragmatism trade-off inherited from
  platform, but purists would call the persistence boundary leaky.
- The API's `handleEffect` returns raw serialized rows in a few places
  (comments) instead of dedicated response models.

**Overall: 3.9 / 5** — a faithful, working distillation of today's stack
with strong seams; the gaps are the same ones the production repos have.

## Improvement suggestions (ordered by value)

1. **Transactional outbox** for create+enqueue. Today `TaskService.create`
   inserts, then publishes; a crash between the two leaves a pending task
   until the cron re-enqueues it (up to ~15 minutes of latency). An outbox
   table written in the same transaction + a drain Lambda (platform has
   this pattern in `liabilities-outbox`) makes delivery exactly-once-ish
   and would be the single most instructive addition.
2. **OpenAPI generation** from the zod schemas (e.g. `hono-openapi` +
   `zod-openapi`), served at `/docs/openapi.json` and rendered in the
   Starlight site — platform generates specs from route metadata; the
   template should demonstrate the audience-aware equivalent.
3. **Observability**: structured JSON logger layer (replacing the default
   Effect logger), OpenTelemetry tracing via `@effect/opentelemetry`, and
   an `_spritzMetadata`-style correlation sidecar on queue messages instead
   of reusing the SQS message id.
4. **Real auth example**: replace the bearer stub with one real mechanism
   (HMAC service auth like internal-api, or JWT verification) including the
   auth-cache warmup pattern.
5. **Domain events**: a typed in-process event bus (or EventBridge
   publisher mirroring platform's `domain-events.ts` raw-detail contract)
   so cross-domain reactions don't couple to the worker.
6. **CI pipeline**: a GitHub Actions workflow running `bun run check` with
   docker services, sharded like platform's `test-shard.ts`, so the gate
   exists from day one.
7. **Value objects & branded types**: brand task ids (`TaskId`), use
   Effect `Schema.brand` at boundaries to stop id-mixups at compile time.
8. **Config fail-fast in deployed stages**: local defaults live in code for
   DX (`.env.example` documents them); consider failing fast when STAGE is
   not local/test and a connection variable is missing, so a misdeployed
   Lambda cannot silently point at localhost.
9. **Queue consumer abstraction**: a transport-agnostic
   `makeBatchConsumer` with an SQS adapter would decouple workers from
   `aws-lambda` types and make the local poller trivial for any queue.
10. **Read-model pagination**: the task list uses id-cursor pagination;
    document (or add) stable created-at cursors once ids stop being
    time-ordered (uuid v7 keeps this working today).
