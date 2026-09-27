# Mercury app

A full-stack TypeScript app created with [Mercury](https://github.com/arvemy/mercury): React, Hono, and PostgreSQL in a pnpm and Turborepo monorepo.

## Get started

You need Node.js 22.22, 24.15, or 26 or later, pnpm 10, and Docker for the local database.

```sh
pnpm dev
```

This starts PostgreSQL in Docker, applies migrations, and runs the web app at http://localhost:5173 and the API at http://localhost:3000. Each of those steps does nothing when it is already done, so run `pnpm dev` every time.

To use your own PostgreSQL instead of Docker, set `DATABASE_URL` in `apps/api/.env`, run `pnpm db:migrate`, then run `pnpm dev:apps`. It starts only the web app and the API.

The todos page is a worked example of the full path from schema to screen. Delete it once you have your own.

## What's inside

| Path          | What it is                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`    | React 19 on Vite, with TanStack Router for file-based routing and TanStack Query for data fetching |
| `apps/api`    | Hono on Node, with Drizzle ORM on PostgreSQL and zod validation                                    |
| `packages/ui` | Shared shadcn/ui components and the Tailwind CSS v4 theme                                          |

Vitest, Oxlint, Oxfmt, a husky pre-commit hook, and a GitHub Actions workflow are set up.

## Scripts

Run these from the project root. Turborepo runs each one across every package.

| Script             | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`         | Start the database, migrate, then start the web app and the API in watch mode |
| `pnpm dev:apps`    | Start only the web app and the API in watch mode                              |
| `pnpm prod`        | Build the production images and start the stack at http://localhost:8080      |
| `pnpm prod:down`   | Stop the production stack                                                     |
| `pnpm build`       | Build every package                                                           |
| `pnpm test`        | Run the Vitest suites                                                         |
| `pnpm lint`        | Lint every package                                                            |
| `pnpm typecheck`   | Typecheck every package                                                       |
| `pnpm format`      | Format the repo with Oxfmt                                                    |
| `pnpm db:generate` | Write a migration from schema changes                                         |
| `pnpm db:migrate`  | Apply migrations                                                              |
| `pnpm db:studio`   | Open Drizzle Studio                                                           |

## Production containers

The web app and the API each build into their own image.

- `apps/api/Dockerfile` builds the API into a Node 24 image that runs as a non-root user. Its health check calls `/api/health`. The same image runs migrations with `node dist/migrate.js`.
- `apps/web/Dockerfile` builds the web app and serves it with Caddy on port 8080 as a non-root user. Caddy proxies `/api` to the API, so the browser talks to one origin.

To run the whole stack like production, run:

```sh
pnpm prod
```

This builds both images and starts PostgreSQL, a one-off migration job, the API, and the web app. The API starts only after migrations succeed. Open http://localhost:8080. The API is not published on the host. Stop the stack with `pnpm prod:down`.

To deploy somewhere else, build the images from the project root:

```sh
docker build -f apps/api/Dockerfile -t my-app-api .
docker build -f apps/web/Dockerfile -t my-app-web .
```

Then run them with these settings:

| Container  | Setting                                                                    | Default    |
| ---------- | -------------------------------------------------------------------------- | ---------- |
| API        | `DATABASE_URL`                                                             | Required   |
| API        | `PORT`                                                                     | `3000`     |
| Migrations | Same image as the API, command `node dist/migrate.js`, with `DATABASE_URL` | None       |
| Web        | `API_UPSTREAM`, the host and port of the API                               | `api:3000` |

Run the migration command before you start a new API version. The credentials in `docker-compose.yml` are for your machine only. Use your own database and secrets in production. TLS belongs in front of the web container, for example in your platform's load balancer.

## Backend

The API lives in `apps/api` (`@workspace/api`). `pnpm dev` starts it alongside the web app, and Vite proxies `/api` to it. Set `PORT` to change its port (default `3000`).

The web app calls it through a typed client.

```ts
import { api } from "@/lib/api"

const res = await api.api.health.$get()
```

`src/lib/api.ts` builds that client from `AppType`, exported by `apps/api/src/app.ts`, so request and response types flow end to end.

## Frontend

Routing is file-based under `apps/web/src/routes`. The TanStack Router Vite plugin generates `src/routeTree.gen.ts` from those files. Keep it committed. Data fetching goes through TanStack Query, with `queryOptions` definitions in `src/lib/queries.ts` shared by route loaders and components.

## Database

`pnpm dev` starts PostgreSQL 18 with Docker Compose, using the credentials in `apps/api/.env`. To start only the database, run `docker compose up -d db`.

The schema lives in `apps/api/src/db/schema.ts`. After changing it, run `pnpm db:generate` to write a migration, then `pnpm db:migrate` to apply it.

## UI components

Add shadcn/ui components from the project root.

```sh
pnpm dlx shadcn@latest add button -c apps/web
```

They land in `packages/ui/src/components`. Import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Agent skills

Coding agents get skills for this stack in `.agents/skills`, linked into `.claude/skills` for Claude Code. They cover shadcn/ui, Turborepo, React composition and performance, React view transitions, web design guidelines, web app testing, Conventional Commits, and Semantic Versioning. `skills-lock.json` records the sources of the skills installed with `npx skills`, and `npx skills update` refreshes them.
