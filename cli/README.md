# create-mercury

[![npm](https://img.shields.io/npm/v/create-mercury)](https://www.npmjs.com/package/create-mercury)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](https://github.com/arvemy/mercury/blob/main/LICENSE)

Create a [Mercury](https://github.com/arvemy/mercury) project with React, Hono, Cloudflare Workers and Static Assets, Neon Postgres, Drizzle, and Neon Auth.

```sh
pnpm create mercury my-app
```

You need Node.js 22.22.2, 24.15.0, or 26 or later, and pnpm 10. Leave out the name for an interactive prompt. Names use lowercase letters, digits, and npm-compatible punctuation.

The CLI copies the template, names the project and page title, copies local environment examples, initializes Git on `main`, installs dependencies, and creates the first commit. It refuses a nonempty target directory. An install failure keeps the generated files and prints recovery commands.

Scaffolding and installation require no cloud credentials. The CLI does not provision accounts or start the app. Open the generated `README.md`, connect the development Neon branch and its managed Auth settings, fill `apps/api/.env`, `apps/web/.env.local`, and `apps/web/.dev.vars`, then run `pnpm dev`.

The generated README covers separate staging and production Workers, Hyperdrive configurations, branch-specific Neon Auth URLs and cookie secrets, custom domains, migrations, and real integration tests.
