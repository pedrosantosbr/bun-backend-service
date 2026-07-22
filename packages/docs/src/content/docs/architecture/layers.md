---
title: Layers & boundaries
description: The package hierarchy and why imports only point one way.
---

The repo is a Bun workspace with five runtime packages arranged in strict
layers. Each package exports raw TypeScript (`"./*": "./src/*.ts"`) — there
is no build step; Bun and tsc resolve workspace source directly.

```
shared  ←  services  ←  core  ←  api / functions
```

| Layer | Contains | Must not know about |
| --- | --- | --- |
| `shared` | tagged errors, app config, request metadata, id helpers | anything internal |
| `services` | HTTP clients for **external** systems (EchoProvider) | core, api, functions |
| `core` | domains (tasks, comments), Postgres/Mongo/queue services, test harnesses | api, functions |
| `api` / `functions` | delivery mechanisms: HTTP routes, Lambda handlers | — |

## Enforcement

`.oxlintrc.json` encodes the matrix with `no-restricted-imports` per package.
A `core` file importing `@template/api` fails `bun run lint` (and therefore
`bun run check` and CI). This is copied from the platform repo, where the
same rules keep the monorepo untangled.

## Rules of thumb

- **Domain logic lives in `core`** — `api` routes and `functions` handlers
  are thin adapters that validate input, call services and shape output.
- **External providers live in `services`** behind a `Context.Tag`
  interface, so `core`/`functions` depend on the interface, never on HTTP
  details.
- **`shared` is the only place for cross-cutting types** (errors, config).
  If `services` and `core` both need it, it goes in `shared`.
- Wiring (which implementation satisfies which tag) happens at the edges:
  `packages/api/src/layers.ts` and `packages/functions/src/layers.ts`.
