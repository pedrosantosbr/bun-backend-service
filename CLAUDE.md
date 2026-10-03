# bun-backend-service (template)

Bun + Effect 4 + Hono + Drizzle backend template. New services are copied
from it (see README → "Adopting for a new service"); copy this file too and
extend it for the service.

## Conventions

- **Commit titles use conventional prefixes:** `feat:` `fix:` `chore:` `docs:`
  `refactor:` `test:` `perf:` `build:` `ci:` `style:` `revert:`. Scope and
  breaking marker are optional: `feat(api): …`, `fix!: …`. Enforced by the
  lefthook `commit-msg` hook (`scripts/check-commit-msg.ts`).
- Layer direction `shared ← services ← core ← api/functions` (oxlint-enforced).
- `Context.Service` + `Layer` per capability; `Schema.TaggedError` only;
  `catchTag` over `Effect.catch`; `Effect.tryPromise`, never `Effect.promise`;
  no `await import`.
- `bun run check` must be green before committing.
