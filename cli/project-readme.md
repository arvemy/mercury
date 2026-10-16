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
| `packages/ui` | Shared Mantine theme configuration and custom components                                           |

Vite+ 1.2.0 provides Vite, Vitest, Oxlint, and Oxfmt. A husky pre-commit hook
and a GitHub Actions workflow are set up. The workspace catalog pins Vite+,
and `packageManager` selects pnpm for its package-management commands.

No global Vite+ installation is required. After `pnpm install`, use
`pnpm exec vp check` for format, lint, and type checks. `pnpm exec vp test`
runs all test projects. API tests need `DATABASE_URL` pointing to a migrated test
database.

`pnpm exec vp run dev` runs the full development script. To start only the Vite
dev server, use `pnpm exec vp -C apps/web dev`. `pnpm exec vp run build` builds
every package in dependency order through Turborepo. Built-in `vp test` runs
Vitest, while `vp run test` runs the project's test script. See the
[Vite+ command guide](https://viteplus.dev/guide).

## Scripts

Run these from the project root.

| Script             | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`         | Start the database, migrate, then start the web app and the API in watch mode |
| `pnpm dev:apps`    | Start only the web app and the API in watch mode                              |
| `pnpm prod`        | Build the production images and start the stack at http://localhost:8080      |
| `pnpm prod:down`   | Stop the production stack                                                     |
| `pnpm build`       | Build every package                                                           |
| `pnpm test`        | Run the Vitest suites                                                         |
| `pnpm check`       | Check formatting, lint rules, and types with Vite+                            |
| `pnpm lint`        | Lint the repo with Oxlint                                                     |
| `pnpm typecheck`   | Typecheck every package                                                       |
| `pnpm format`      | Format the repo with Oxfmt                                                    |
| `pnpm db:generate` | Write a migration from schema changes                                         |
| `pnpm db:migrate`  | Apply migrations                                                              |
| `pnpm db:studio`   | Open Drizzle Studio                                                           |

## Production containers

The web app and the API each build into their own image.

- `apps/api/Dockerfile` builds the API into a Node 26 image that runs as a non-root user. Its health check calls `/api/health`. The same image runs migrations with `node dist/migrate.js`.
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

Import standard components directly from Mantine.

```tsx
import { Button, TextInput } from "@mantine/core"
```

Icons come from [Tabler Icons](https://tabler.io/icons). Import each icon by name from `@tabler/icons-react` and pass it to props such as a button's `leftSection`.

```tsx
import { IconPlus } from "@tabler/icons-react"
```

The app imports Mantine's core styles and uses `MantineProvider` with the shared theme from `packages/ui/src/theme.ts`. Edit that theme to customize colors, typography, and component defaults. Add reusable custom components under `packages/ui/src/components` and export them from `packages/ui/package.json`.

The theme follows the system color scheme by default. Use `useMantineColorScheme` when adding a color-scheme control. Mantine stores the choice under its native `mantine-color-scheme-value` key. Custom styles use CSS modules with Mantine's PostCSS preset.

## Agent skills

Coding agents get skills for this stack in `.agents/skills`, linked into `.claude/skills` for Claude Code. The official Mantine skills cover comboboxes, forms, and custom components. Other skills cover Turborepo, React composition and performance, React view transitions, web design guidelines, web app testing, Conventional Commits, and Semantic Versioning. `skills-lock.json` records the sources of the skills installed with `npx skills`, and `npx skills update` refreshes them.

Use Mantine's [LLM documentation](https://mantine.dev/llms.txt) for component APIs, hooks, theming, and styling.

`.mcp.json` registers Mantine's MCP server, which lets agents search the Mantine docs and look up component props. Claude Code asks you to approve it the first time. Other agents can add it with the command from [Mantine's guide](https://mantine.dev/guides/llms/), such as `codex mcp add mantine -- npx -y @mantine/mcp-server`.
