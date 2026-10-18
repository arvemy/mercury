# Mercury

[![npm](https://img.shields.io/npm/v/create-mercury?label=create-mercury)](https://www.npmjs.com/package/create-mercury)
[![CI](https://github.com/arvemy/mercury/actions/workflows/ci.yml/badge.svg)](https://github.com/arvemy/mercury/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

A TypeScript starter with React and Hono in one Cloudflare Worker. Static Assets serve the web app, Neon Postgres stores data through Hyperdrive and Drizzle, and Neon Auth protects each user's todos.

```sh
pnpm create mercury my-app
cd my-app
```

You need Node.js 22.22.2, 24.15.0, or 26 or later, and pnpm 10. Creating and installing a project needs no cloud credentials.

The CLI copies local environment examples and installs dependencies. Before running `pnpm dev`, install the [official Neon CLI](https://neon.com/docs/cli/install) and link your development project from the project root:

```sh
neon init --services postgres,auth
neon deploy
```

The root `neon.ts` enables managed Neon Auth. Neon pulls the branch's database and Auth values into root `.env.local` or `.env`. The [project setup guide](cli/project-readme.md#connect-development-services) covers sign-in, the restricted runtime connection, the cookie secret, and deployment.

## What you get

| Layer          | Tools                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Web            | React, Vite+, TanStack Router, and TanStack Query.                                                   |
| API            | Hono in the same Cloudflare Worker, with a typed RPC client and zod validation.                      |
| Database       | Neon Postgres through Hyperdrive, `pg`, Drizzle's `node-postgres` adapter, and committed migrations. |
| Authentication | Neon Auth sign-in and private todos with server-derived ownership.                                   |
| UI             | Mantine, a shared theme, and Tabler Icons.                                                           |
| Quality        | TypeScript, Vitest, Oxlint, Oxfmt, and a pre-commit hook.                                            |
| Delivery       | Two named Workers for staging and production, custom domains, and Workers Builds.                    |
| Verification   | Credential-free checks plus live Neon Auth, database, and deployed Worker suites.                    |
| Agents         | Stack skills in `.agents/skills`, linked for Claude Code.                                            |

The browser calls same-origin `/api/auth/*` through the official Neon SDK. `/` and `/api/health` are public. `/todos` requires sign-in. Anonymous todo API requests receive JSON with HTTP 401. The API assigns each todo to the verified Neon Auth user and filters reads by that owner.

Development and staging use separate branches in a nonproduction Neon project. Production uses a separate Neon project. Each environment has its own restricted runtime role, branch-specific Neon Auth URL, and random cookie secret. Staging and production have separate Hyperdrive configurations, Workers, and custom domains. Migration commands use a separate database-owner credential. Generic branch previews are disabled.

## Work on Mercury

This repository is both the working template app and the source of `create-mercury`.

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
```

These checks need no cloud credentials. `pnpm test:integration` requires an isolated nonproduction Neon project with management API access. It configures Auth only on an owned temporary branch, registers users through the UI, proves cookie sessions and ownership, and deletes that branch with its users. `pnpm test:deployed` deploys an owned temporary Worker and Hyperdrive configuration, verifies the app over HTTPS on `workers.dev`, and deletes its resources. Email delivery, custom-domain DNS, and TLS need separate checks with your inbox and domain. If the process is killed, remove only the owned resource IDs recorded in its evidence directory. The [project guide](cli/project-readme.md#run-checks) lists the required variables.

- `cli/src` creates projects, and `cli/scripts/snapshot.ts` selects the git-tracked template files.
- `cli/project-readme.md` becomes the README in generated projects.
- `cli/scripts/smoke.sh` packs the CLI, creates a project from the tarball, and checks the generated app without cloud credentials. Pass a tarball path to verify an already packed artifact.
- `cli/scripts/next-steps.sh` checks the printed setup instructions and the actionable failure from unconfigured development startup.
- Only `.github/workflows/ci.yml` ships from `.github`. The release and CLI workflows belong to this repository.
- The `verify` skill selects the app or CLI driver. App verification uses the real Worker, Neon, and Neon Auth. CLI verification drives the packed tarball in a terminal.

New template files must be tracked, or marked with `git add -N`, before packing. Repository-only `.audit`, `docs`, CLI source, and verification skills stay out of generated projects.

Releases come from a `v*` tag matching `cli/package.json`. The protected `release` environment requires `pnpm test:integration` to pass for real Neon Postgres and Neon Auth before the workflow packs, smoke-checks, and publishes the tagged tarball. npm trusted publishing publishes that same tarball with provenance. Configure the protected `integration` and `release` environments as described in the [contributor guide](.github/CONTRIBUTING.md#configure-trusted-live-tests). Missing live-test configuration blocks a release.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
