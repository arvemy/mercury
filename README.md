# Mercury

[![npm](https://img.shields.io/npm/v/create-mercury?label=create-mercury)](https://www.npmjs.com/package/create-mercury)
[![CI](https://github.com/arvemy/mercury/actions/workflows/ci.yml/badge.svg)](https://github.com/arvemy/mercury/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

An opinionated TypeScript full-stack starter. React, Hono, and PostgreSQL, powered by pnpm and Turborepo.

```sh
pnpm create mercury my-app
```

One command gives you a working monorepo with a typed API, a database, a UI kit, tests, CI, and agent skills. There are no options to choose from. Every project starts from the same tested stack.

## Quick start

You need Node.js 22.22, 24.15, or 26 or later, pnpm 10, and Docker for the local database.

```sh
pnpm create mercury my-app
cd my-app
pnpm dev
```

`pnpm dev` starts PostgreSQL in Docker, applies migrations, and runs the web app at http://localhost:5173 and the API at http://localhost:3000. Leave out `my-app` to be asked for a name.

`create-mercury` copies the template, names the project, writes `apps/api/.env`, installs dependencies, and makes the first commit on `main`.

## What you get

| Layer    | Tools                                                                                        |
| -------- | -------------------------------------------------------------------------------------------- |
| Web      | React 19, Vite, TanStack Router with file-based routes, TanStack Query                       |
| API      | Hono on Node, zod validation, a Hono RPC client typed end to end from the API to the web app |
| Database | PostgreSQL 18 in Docker Compose, Drizzle ORM and migrations                                  |
| UI       | shadcn/ui components in a shared package, Tailwind CSS v4, a `d` key dark-mode toggle        |
| Quality  | TypeScript 7, Vitest, ESLint, Prettier, a husky and lint-staged pre-commit hook              |
| Build    | pnpm workspaces and Turborepo                                                                |
| CI       | A GitHub Actions workflow that lints, typechecks, builds, migrates, and tests                |
| Agents   | Skills for the stack in `.agents/skills`, linked for Claude Code                             |

A todos page shows the full path from schema to migration to API route to typed client to page. Delete it once you have your own.

## Project layout

```text
my-app/
├── apps/
│   ├── api/        Hono API, Drizzle schema and migrations
│   └── web/        React app, routes, and queries
├── packages/
│   └── ui/         shadcn/ui components and the Tailwind theme
├── .agents/skills/ Skills for coding agents
└── docker-compose.yml
```

The generated project has its own README with scripts and how each part works.

## Work on Mercury

This repository is the template. The root is a working Mercury app, and `cli/` holds `create-mercury`, which packs a snapshot of the root.

- `pnpm dev`, `pnpm test`, and the other root scripts run the template app.
- `cli/scripts/next-steps.sh` creates a project and runs the next steps the CLI prints, then checks that the app answers. It needs Docker.
- `cli/scripts/smoke.sh` packs the CLI, creates a project from the tarball, and runs its migrations, lint, typecheck, build, and tests. Set `DATABASE_URL` first.
- `cli/scripts/snapshot.ts` decides what ships. Repo-only files go in its `EXCLUDED` list. From `.github/`, only `workflows/ci.yml` ships.
- `cli/project-readme.md` is the README that generated projects get.
- The `verify-mercury` and `verify-create-mercury` skills drive the real app and the real CLI for end-to-end checks.

Releases publish from a `v*` tag through `.github/workflows/release.yml` with npm trusted publishing. The tag must match the version in `cli/package.json`.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for the copyright notice.
