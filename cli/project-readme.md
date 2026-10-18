# Mercury app

React and Hono run as one Cloudflare Worker with Static Assets. Neon Postgres stores private todos through Hyperdrive and Drizzle. Managed Neon Auth identifies users with same-origin session cookies.

## Connect development services

Use a nonproduction [Neon project](https://neon.com/docs/manage/projects) on AWS with separate development and staging branches. Keep production in a separate project. Managed Neon Auth cannot use IP Allow or Private Networking. Keep existing network protections in place and choose a compatible project. Start with an empty database. Review [existing identities](#keep-existing-identity-ownership) before upgrading a populated database.

Install the [official Neon CLI](https://neon.com/docs/cli/install) and sign in if needed. Run setup from the project root:

```sh
npm i -g neon@latest
neon login
neon init --services postgres,auth
```

During [init](https://neon.com/docs/cli/init), create or link the nonproduction project. To select an existing development branch, add `--branch <development-branch>`. The root `neon.ts` already declares `auth: true`, and the project includes `@neon/config` and `@neon/env`. If pnpm blocks a workspace-root dependency install, run `pnpm add -Dw @neon/config @neon/env`, then retry init. If existing agent tooling conflicts with setup, add `--no-agent-setup` on the retry.

Confirm that `.neon` links to the development branch, then apply the config:

```sh
neon deploy
```

[Deploy](https://neon.com/docs/cli/deploy) enables managed Neon Auth and pulls the branch's values into root `.env` if it exists, otherwise `.env.local`. The file contains pooled `DATABASE_URL`, direct owner `DATABASE_URL_UNPOOLED`, and the complete `NEON_AUTH_BASE_URL`. Mercury uses the unpooled owner URL for development migrations. Root Neon values are fallbacks. Explicit process variables and nonempty values in the app's local files take precedence.

In the development branch's [Managed Neon Auth settings](https://neon.com/docs/auth/overview), enable email/password signup and choose email verification by code, `otp`. Enable automatic verification emails on signup so Neon sends the initial code. Disable automatic verification emails on signin, where the form explicitly requests a code for an unverified account. Enable automatic signin after verification. Add `http://localhost:5173` to [trusted domains](https://neon.com/docs/auth/guides/configure-domains), including the scheme and port with no trailing slash. Each branch has its own Auth URL and auth state. Register the exact origin for staging and production too.

Fill the local files copied by `create-mercury`:

| File                  | Values                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.env.local` | `APP_ORIGIN=http://localhost:5173` and `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, the direct URL for the restricted runtime role created below. Leave `NEON_AUTH_BASE_URL` blank to use Neon CLI values. |
| `apps/web/.dev.vars`  | `NEON_AUTH_COOKIE_SECRET`, a random secret of at least 32 characters, unique to this environment.                                                                                                                         |
| `apps/api/.env`       | Optional `DATABASE_URL` override for migrations. Leave it blank to use the root `DATABASE_URL_UNPOOLED`. Any override must be the database owner's direct URL.                                                            |

Generate the cookie secret with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`. Cloudflare loads development secrets exclusively from `.dev.vars.development` when present, otherwise `.dev.vars`. Fill the selected file even if your shell supplies a secret. Keep these local environment files out of Git. No `VITE_*` auth configuration, Neon management key, or auth provider key enters the browser. The official React client calls `/api/auth/*` on the app's origin. The Worker forwards those requests to the configured Neon Auth URL and validates the current session for private API access.

When working from the Mercury repository, copy the examples first:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Apply the initial migrations with `pnpm db:migrate`, then [create the runtime role](#create-the-runtime-database-role) and fill its local Hyperdrive URL. Run `pnpm dev` to validate configuration, apply migrations, and start the app at http://localhost:5173. Missing or placeholder values stop startup. The command does not provision services.

Open `/` for public health status. Open `/todos` to sign in or create an account. If verification is required, enter the emailed code or resend it. **Forgot password** opens the code-based reset form. Shared SMTP supports development codes. [Production requires custom SMTP](https://neon.com/docs/auth/production-checklist), which you configure in Neon. Check delivery, verification, resend, and reset with a real mailbox before production.

The API derives ownership from the verified Neon Auth user. A second user cannot read the first user's todos. Anonymous `/api/todos` requests return JSON with HTTP 401. Production uses HTTPS. Local Chromium accepts secure cookies on loopback HTTP, but local Safari requires HTTPS.

## Create the runtime database role

After applying migrations, open the target branch and database in the Neon SQL Editor as the database owner. Create a separate runtime login for each environment with a different password. Replace `neondb`, `mercury_runtime`, and the password with that environment's values.

```sql
CREATE ROLE mercury_runtime LOGIN PASSWORD 'replace-with-a-random-password'
	NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO mercury_runtime;
GRANT USAGE ON SCHEMA public TO mercury_runtime;
GRANT SELECT, INSERT ON TABLE public.todos TO mercury_runtime;
```

Create this role [with SQL](https://neon.com/docs/manage/roles#manage-roles-with-sql). Neon's Console, CLI, and API role-creation flows add `neon_superuser` membership. Keep the runtime role outside that membership and do not grant schema creation, table ownership, or migration privileges. The current identity column needs no separate sequence grant. Grant permissions for future tables explicitly when their features need them. The app does not read or write `neon_auth` tables through this runtime role.

Use the runtime role's direct URL in Hyperdrive and the local Hyperdrive override. Keep the owner's direct URL in root `DATABASE_URL_UNPOOLED` or an explicit migration `DATABASE_URL`. The browser and deployed Worker runtime must not receive the owner credential.

## Configure staging and production

Use separate runtime credentials, branch Auth URLs, and cookie secrets for development, staging, and production. Each deployed environment needs its own Worker, Hyperdrive configuration, and HTTPS custom domain.

1. Set the target database owner's direct `DATABASE_URL` in your shell or protected build environment. Apply migrations with `pnpm db:migrate:staging` or `pnpm db:migrate:production`. Migration commands do not require auth settings or Hyperdrive.
2. Create a restricted runtime role in each database. Create a [Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/get-started/) with that role's direct URL. Disable query caching so a todo write is visible on the next read.
3. Enable Managed Neon Auth on each target branch. Enable email/password signup, configure OTP verification and production SMTP, and register the app's exact HTTPS origin in trusted domains. Set `NEON_AUTH_BASE_URL` to that branch's complete returned URL.
4. Set `CLOUDFLARE_ACCOUNT_ID`, `HYPERDRIVE_ID`, `APP_ORIGIN`, and `CLOUDFLARE_CUSTOM_DOMAIN` in each build environment. `APP_ORIGIN` includes the scheme and must match the custom domain. Configure Cloudflare deployment authentication. `apps/web/cloudflare.config.ts` defines the named Worker bindings.
5. Add a distinct `NEON_AUTH_COOKIE_SECRET` as a Worker secret for each environment. For the first deployment, set `WORKER_SECRETS_FILE` to a JSON file mapping `NEON_AUTH_COOKIE_SECRET` to its value. Keep that file outside Git. Existing Workers can receive the secret through Cloudflare's CLI.
6. Set the database owner's `DATABASE_URL` as a build secret for migrations. Remote commands do not load local `.env` files. Keep local `.env.local` and `.dev.vars` files out of remote builds.

Use [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) with two named Workers connected to the repository.

| Worker     | Production branch | Build command                       | Deploy command           |
| ---------- | ----------------- | ----------------------------------- | ------------------------ |
| Staging    | `staging`         | `pnpm verify && pnpm build:staging` | `pnpm deploy:staging`    |
| Production | `main`            | `pnpm verify && pnpm build`         | `pnpm deploy:production` |

Disable nonproduction branch builds and generic preview deployments on both Workers. Each deployment has an explicit database branch, Auth endpoint, Hyperdrive configuration, cookie secret, and domain. The deploy scripts migrate the target before publishing the built Worker with `cf deploy --prebuilt`. Review schema changes before deployment.

## Keep existing identity ownership

This version starts with a fresh database. The ownership migration refuses existing ownerless rows. Existing todo owners are text IDs, so a Clerk user ID does not become a Neon Auth ID after this migration. For existing users, create and review an explicit Clerk-ID-to-Neon-ID mapping before changing ownership. Never reassign existing records automatically or give all records to the first user who signs in.

## Validate a deployment and recover

Run the credential-free checks and configured live suite before promoting the same reviewed revision through staging to production. The live suite uses a local Worker and its own Neon branch. Deployed Hyperdrive, domains, SMTP delivery, email-code verification, and password recovery need separate verification.

After each deployment, check the custom domain. Confirm `/api/health` returns HTTP 200 and anonymous `/api/todos` returns JSON with HTTP 401. Directly open `/todos`, `/sign-in`, `/sign-up`, and `/reset-password`. Register and verify an account with a real inbox, reset its password, sign in, create a todo, reload, confirm a second account cannot see it, and sign out. Inspect Worker errors and Neon connections.

Record the Worker version and migration revision. Before changing a populated database, confirm a recoverable Neon recovery point and rehearse the migration on a separate branch. Prefer additive changes compatible with the previous Worker version.

If checks fail, stop further deployments and use [Cloudflare rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) to restore a previously verified compatible Worker. Check its bindings and branch Auth URL, then repeat health and authentication checks. Worker rollback does not undo database writes or schema changes. Repair the database with a reviewed forward migration, or rehearse recovery to a separate database before redirecting Hyperdrive. Do not automatically overwrite new writes.

## Run checks

The default checks need no cloud credentials.

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
```

`test:worker` runs the built Worker and checks public pages, health, anonymous HTTP 401 responses, and API routing. Deterministic auth fixtures exercise the real SDK boundary but do not prove live managed authentication.

The pinned Miniflare version carries a local transport patch for [workerd issue 7634](https://github.com/cloudflare/workerd/issues/7634). It retires local preview connections after requests with bodies, while preserving bodyless connection reuse. `pnpm test` checks sockets, uploads, and streamed responses. After building, `pnpm test:preview-transport` repeats the original public HTTP sequence 1,000 times. Keep the patch until a supported upstream version passes these checks.

The live suite needs an API key scoped to an isolated nonproduction Neon project. Set exactly these required values:

```sh
export NEON_API_KEY=...
export NEON_PROJECT_ID=...
export NEON_BRANCH_ID=...
pnpm exec playwright install chromium
pnpm test:integration
```

`NEON_BRANCH_ID` is the parent to copy, with an empty database or the current owner-aware schema. The suite never migrates or configures the parent. Optional `NEON_DATABASE_NAME` and `NEON_ROLE_NAME` default to `neondb` and `neondb_owner`.

The suite creates an owned child branch, waits for operations, retrieves or enables that child's Auth, enables email/password, disables required email verification on that child, and confirms the settings. It migrates the child, runs API tests in an isolated schema, starts a scratch local Worker with a random cookie secret, and trusts its exact origin only on the child. Plain Playwright registers two accounts through the UI and proves signin, session restoration, todo persistence, database ownership, user isolation, and signout through cookies. It never uses fabricated users, bearer tokens, or custom identity headers as live proof.

The live suite does not prove email delivery. In a nonproduction environment with required OTP verification and your configured mail provider, register with a real inbox. Enter actual received codes and check verification and reset resends. Create a private todo, reset the password, confirm the old password fails, and confirm the new password restores the same account and todo after reload. Keep passwords, codes, email bodies, session cookies, and tokens out of logs and screenshots. Verify production SMTP separately.

To test the deployed Worker and Hyperdrive, sign in with `pnpm --dir apps/web exec cf auth login`. Keep the same Neon test variables and set `CLOUDFLARE_ACCOUNT_ID` and `WORKERS_DEV_SUBDOMAIN` to your account ID and existing workers.dev subdomain label. Then run `pnpm test:deployed`. This creates a temporary public Worker, a Hyperdrive configuration with query caching disabled, and an owned Neon child with a restricted runtime role. It checks the deployed bindings, HTTPS routes, static headers, cookie sessions, persistence, and ownership, then deletes those resources and verifies their removal. It preserves existing Workers and Hyperdrive configurations. No domain purchase is needed. Custom-domain attachment and DNS require a separate check on a domain you control.

A `finally` block stops the owned Worker, deletes scratch settings, and deletes only the recorded child branch. Branch deletion removes the test users and sessions. Evidence stays in `.audit/integration-*/`, including `neon-branch.json`, `neon-auth.json`, `browser/neon-auth-users.json`, and `neon-cleanup.txt`. The branch has no automatic expiry. If the process is killed or cleanup fails, remove only the exact child ID recorded in `neon-branch.json`. Keep the parent. Missing configuration fails the command and never counts as a passing skip.

For trusted CI runs, create a protected GitHub environment named `integration`:

| Kind               | Names                                  |
| ------------------ | -------------------------------------- |
| Secrets            | `NEON_API_KEY`                         |
| Variables          | `NEON_PROJECT_ID`, `NEON_BRANCH_ID`    |
| Optional variables | `NEON_DATABASE_NAME`, `NEON_ROLE_NAME` |

Require reviewers and trusted refs. Run through workflow dispatch, or set `RUN_LIVE_INTEGRATION=true` for trusted pushes after reviewing the code. Pull requests receive no live secrets. CI retains only sanitized, allowlisted text evidence. Keep credentials, session cookies, auth responses, and environment files out of evidence.

## Use the commands

| Command                       | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                    | Validate development configuration, migrate, and start the Worker. |
| `pnpm build`                  | Build the production Worker and assets.                            |
| `pnpm build:staging`          | Build with staging bindings.                                       |
| `pnpm preview`                | Run the built Worker locally.                                      |
| `pnpm cf:types`               | Generate Cloudflare binding types.                                 |
| `pnpm test`                   | Run credential-free unit suites.                                   |
| `pnpm test:worker`            | Check built public routes and anonymous authorization.             |
| `pnpm test:integration`       | Run the real Neon Auth and database suite.                         |
| `pnpm test:deployed`          | Verify an owned live Worker and Hyperdrive on workers.dev.         |
| `pnpm test:preview-transport` | Repeat the built preview HTTP sequence 1,000 times.                |
| `pnpm check`                  | Check formatting, lint rules, and types.                           |
| `pnpm db:generate`            | Generate a migration after a schema change.                        |
| `pnpm db:migrate`             | Migrate development with the owner credential.                     |
| `pnpm db:migrate:staging`     | Migrate with an explicit staging `DATABASE_URL`.                   |
| `pnpm db:migrate:production`  | Migrate with an explicit production `DATABASE_URL`.                |
| `pnpm deploy:staging`         | Migrate and deploy staging.                                        |
| `pnpm deploy:production`      | Migrate and deploy production.                                     |

Vite+ supplies Vite, Vitest, Oxlint, and Oxfmt through the pinned workspace catalog. Use root scripts to keep environment selection and migrations consistent.

## Find the code

| Path          | Contents                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| `apps/web`    | React, Neon Auth forms, TanStack Router, TanStack Query, and Cloudflare configuration. |
| `apps/api`    | Worker entry, Hono routes, managed session checks, Drizzle schema, and migrations.     |
| `packages/ui` | Shared Mantine theme and components.                                                   |
| `scripts`     | Development, deployment, built Worker checks, and live integration checks.             |

The web app uses a typed Hono RPC client. Route files live in `apps/web/src/routes`; TanStack Router generates `routeTree.gen.ts`. Add new SPA routes to `apps/web/public/_redirects`. The current routes are `/`, `/todos`, `/sign-in`, `/sign-up`, and `/reset-password`.

Import standard components from `@mantine/core` and icons from `@tabler/icons-react`. Edit `packages/ui/src/theme.ts` for the shared theme. Mantine follows the system color scheme and stores a chosen preference under `mantine-color-scheme-value`.

Agent skills in `.agents/skills` cover Cloudflare, Neon, Neon Auth, Hono, React, TanStack Router, Mantine, and workspace tooling. The CLI links installed skills into `.claude/skills`; `skills-lock.json` records their sources. See [Drizzle's node-postgres guide](https://orm.drizzle.team/docs/get-started-postgresql#node-postgres) for database access. `.mcp.json` registers [Mantine's MCP server](https://mantine.dev/guides/llms/).

Use `postgres-best-practices` with `neon-postgres` for managed Neon behavior. Preserve [Neon Auth text `ownerId` values](#keep-existing-identity-ownership) and application ownership filters. Keep [restricted runtime grants](#create-the-runtime-database-role) and [Hyperdrive pooling](#configure-staging-and-production). Generic session `SET`, RLS, and server administration examples are not Mercury app configuration. Review extension and schema changes as migrations using the database owner. Drizzle's default migration runner uses a transaction. Keep `CREATE INDEX CONCURRENTLY` out of ordinary migrations and review it separately.
