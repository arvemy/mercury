# create-mercury

[![npm](https://img.shields.io/npm/v/create-mercury)](https://www.npmjs.com/package/create-mercury)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/arvemy/mercury/blob/main/LICENSE)

Create a [Mercury](https://github.com/arvemy/mercury) project. Mercury is an opinionated TypeScript full-stack starter with React, Hono, and PostgreSQL, powered by pnpm and Turborepo.

```sh
pnpm create mercury my-app
```

Leave out the name to be asked for one. The name must be a valid npm package name in lowercase.

## What it does

1. Copies the Mercury template into `my-app`. It refuses a directory that already has files in it.
2. Names the project in `package.json` and the page title, and writes `apps/api/.env`.
3. Runs `git init` on `main`, then `pnpm install`, then makes the first commit.
4. Prints the next steps.

If `pnpm install` fails, the files stay in place, and the CLI prints the commands to run again.

## Next steps

You need Node.js 22.22, 24.15, or 26 or later, pnpm 10, and Docker for the local database.

```sh
cd my-app
docker compose up -d db
pnpm db:migrate
pnpm dev
```

See the [Mercury README](https://github.com/arvemy/mercury#readme) for what the project includes.
