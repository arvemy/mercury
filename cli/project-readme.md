# Mercury app

A full-stack TypeScript app created with [Mercury](https://github.com/arvemy/mercury): React, Hono, and PostgreSQL in a pnpm and Turborepo monorepo.

## Get started

You need Node.js 22.22, 24.15, or 26 or later, pnpm 10, and Docker for the local database.

```sh
docker compose up -d db
pnpm db:migrate
pnpm dev
```

The web app runs at http://localhost:5173 and the API at http://localhost:3000.

The todos page is a worked example of the full path from schema to screen. Delete it once you have your own.

## What's inside

| Path          | What it is                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`    | React 19 on Vite, with TanStack Router for file-based routing and TanStack Query for data fetching |
| `apps/api`    | Hono on Node, with Drizzle ORM on PostgreSQL and zod validation                                    |
| `packages/ui` | Shared shadcn/ui components and the Tailwind CSS v4 theme                                          |

Vitest, ESLint, Prettier, a husky pre-commit hook, and a GitHub Actions workflow are set up.

## Scripts

Run these from the project root. Turborepo runs each one across every package.

| Script             | What it does                                |
| ------------------ | ------------------------------------------- |
| `pnpm dev`         | Start the web app and the API in watch mode |
| `pnpm build`       | Build every package                         |
| `pnpm test`        | Run the Vitest suites                       |
| `pnpm lint`        | Lint every package                          |
| `pnpm typecheck`   | Typecheck every package                     |
| `pnpm format`      | Format the repo with Prettier               |
| `pnpm db:generate` | Write a migration from schema changes       |
| `pnpm db:migrate`  | Apply migrations                            |
| `pnpm db:studio`   | Open Drizzle Studio                         |

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

`docker compose up -d db` starts PostgreSQL 18 with the credentials in `apps/api/.env`.

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
