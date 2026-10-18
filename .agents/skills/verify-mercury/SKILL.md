---
name: verify-mercury
description: Prove Mercury's Worker, Neon database, and managed Neon Auth through browser and HTTP checks. Use the built Worker, live session, deployed Worker, or preview transport checks for web, API, authentication, database, and deployment changes.
---

# Verify Mercury

Read [the feature map](features/README.md), then run the matching checks from the repository root. The web app and Hono API share one Worker, the Cloudflare Vite plugin, and Hyperdrive bindings.

## Select the check

Run `.agents/skills/verify-mercury/scripts/run.sh` from the repository root with the matching flag.

| Flag         | Proof                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--public`   | Builds and previews the Worker without credentials. Checks public routes, headers, asset caching, anonymous JSON 401 responses, and 404 routing. |
| No flag      | Runs migrations, isolated API tests, and real Neon Auth signup, signin, reload, ownership, isolation, and signout on an owned child branch.      |
| `--deployed` | Deploys an owned HTTPS Worker and Hyperdrive configuration, then checks HTTP behavior, real Neon Auth, UI writes, and database ownership.        |

## Check the built Worker without credentials

```sh
.agents/skills/verify-mercury/scripts/run.sh --public
```

This builds and previews the actual Worker on a free port. `scripts/verify-worker.mjs` stops only its owned process group. Evidence stays in `.audit/worker-smoke`. Authenticated Neon access needs a live check.

## Configure the live run

Use a Neon management API key scoped to an isolated nonproduction project on AWS without IP Allow or Private Networking. Set `NEON_API_KEY`, `NEON_PROJECT_ID`, and `NEON_BRANCH_ID` in the process environment. Optional `NEON_DATABASE_NAME` and `NEON_ROLE_NAME` default to `neondb` and `neondb_owner`. Install Chromium with `pnpm exec playwright install chromium`. Keep credentials out of chat and evidence.

```sh
.agents/skills/verify-mercury/scripts/run.sh
```

Missing configuration fails with the required variable names. Never replace real authentication with injected users, mocked provider endpoints, custom identity headers, bearer tokens, or fabricated session cookies as live proof.

## Drive local sessions

`scripts/integration.mjs` creates a unique owned Neon child, records its ID, and waits for operations. It retrieves or enables that child's Auth, enables email/password, disables required email verification there, and reads the settings back. It never migrates or configures the parent. The run migrates the child and runs API tests in an isolated schema.

Tracked app files are copied into a scratch directory with installed dependencies linked. The actual child Auth URL, database URL, and random cookie secret stay in scratch settings. A local Worker starts on a free port, then the helper trusts its exact origin only on the owned child.

`scripts/neon-auth-e2e.mjs` uses plain Playwright to register two unique users through the real signup form. It explicitly signs each user out and back in. Same-origin cookies authenticate the app. The browser captures home and color scheme states, anonymous protection, authenticated navigation, todo creation, reload restoration, second-user isolation, and signout. A direct Neon SQL query confirms the saved title and current Neon Auth user ID.

The live run does not prove email delivery, verification codes, or password recovery. Follow the [manual real-inbox recipe](features/authentication.md#check-email-with-a-real-inbox) for those checks. Verify production SMTP separately.

A `finally` block stops the owned Worker, removes scratch settings, and deletes only the recorded child branch. Branch deletion removes its test users and sessions. The branch does not expire automatically. If the process is killed, recover only resources identified in that run's evidence. Never delete by prefix or search. Never kill processes by name or port.

## Drive a deployed Worker

Set the same three required Neon variables, `CLOUDFLARE_ACCOUNT_ID`, and `WORKERS_DEV_SUBDOMAIN`. Use the account's existing workers.dev subdomain label, optionally ending in `.workers.dev`. Authenticate the installed Cloudflare CLI with `pnpm --dir apps/web exec cf auth login` or provide `CLOUDFLARE_API_TOKEN` in the environment.

```sh
.agents/skills/verify-mercury/scripts/run.sh --deployed
```

This runs `pnpm test:deployed`. `scripts/verify-deployed.mjs` creates a unique Worker, a Hyperdrive configuration, and a Neon child. It checks that the Worker and Hyperdrive names are unused before creation. It records exact resource IDs as soon as they are available in `.audit/deployed-<timestamp>/owned-resources.json` and `neon-branch.json`.

The runner migrates with the child owner's credentials, then creates a restricted SQL runtime role. Hyperdrive receives that role with only database connection, schema usage, and todo SELECT and INSERT grants. The runner confirms that the role has no owner privileges and cannot alter the table. Hyperdrive query caching is disabled and read back. Owner credentials never enter the build environment or generated artifact.

The production artifact deploys to `https://<unique-worker>.<existing-subdomain>.workers.dev` with a secret cookie key and the owned Hyperdrive binding. HTTP checks cover SPA routing, security headers, immutable hashed assets, anonymous reads and writes, and missing routes. The browser proves signup, signin, reload, todo creation, two-user isolation, and signout against that HTTPS origin. A direct Neon query confirms ownership.

The runner deletes only its owned Worker, Hyperdrive configuration, and Neon child. It requires GET readbacks with 404 after deletion and records each cleanup result. `PASS` appears only after behavior and cleanup succeed. After interruption, inspect exact resource IDs before recovery. Never repurpose or delete existing resources. This check proves workers.dev HTTPS, not custom-domain DNS or TLS.

## Check repeated preview requests

Run these checks after changing the Cloudflare Vite plugin, Miniflare patch, or preview transport:

```sh
node --test scripts/preview-transport.test.mjs
pnpm build
pnpm test:preview-transport
```

The two Node tests check socket reuse, socket retirement after request bodies, uploads, streamed responses, and early authorization responses. The built preview check runs 1,000 cycles with six responses per cycle. It checks health, anonymous reads and writes, unknown API routes, and missing assets. Retain its terminal result and `.audit/preview-transport/worker.log`.

`pnpm-workspace.yaml` applies `patches/miniflare@5.20261012.0-beta.patch` to that exact Miniflare version. The patch retires connections after requests with bodies to mitigate the preview failure tracked in [workerd issue 7634](https://github.com/cloudflare/workerd/issues/7634). A passing Mercury check does not establish that the upstream defect is fixed. Reassess the patch and rerun these checks when upgrading Miniflare.

## Read the evidence

Local live runs write `.audit/integration-<timestamp>/`:

- `neon-branch.json` records the nonsecret project, parent, branch, and name.
- `neon-auth.json` records the confirmed child auth mode. `neon-auth-origin.json` records the owned Worker's trusted origin.
- `migrate.log`, `api-integration.log`, and `worker.log` record migrations, API tests, and Worker behavior with secrets redacted.
- `browser/*.png` and `*.aria.txt` show user-visible states.
- `browser/network.log` records method, path, and status only. Never record auth response bodies, headers, cookies, or tokens.
- `browser/checks.log`, `database.json`, and `neon-auth-users.json` record assertions, saved ownership, and created user IDs.
- `neon-cleanup.txt` records completed branch deletion after its operations finish.
- `PASS` exists only after the full run and cleanup succeed.

Never persist passwords, tokens, email bodies, or OTP values. Screenshots mask password and code inputs. ARIA and error evidence redact their values. The network log contains no request or response bodies.

Deployed runs use `.audit/deployed-<timestamp>/`. Inspect `owned-resources.json`, `runtime-role.json`, `worker.config.json`, `coverage.json`, HTTP `checks.log`, `browser/`, and `cleanup-*.json`. Cloudflare command logs record resource readbacks and deletion checks with credentials redacted.

Report the command, observed result, and evidence path. A public pass cannot replace missing live or deployed proof. Automated session checks cannot replace manual email proof. A failed or incomplete run is not a pass. After failure, inspect logs and cleanup before retrying. Extend the plain Playwright driver for new UI entry points. CI and release upload only sanitized, allowlisted text evidence.
