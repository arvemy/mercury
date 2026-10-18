# Contributing to Mercury

The repository root is the working template app. `cli/` packs that app into `create-mercury`. `cli/scripts/snapshot.ts` selects git-tracked template files, and `cli/project-readme.md` becomes the generated README. Only `.github/workflows/ci.yml` ships from `.github`.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report security issues through the [security policy](SECURITY.md).

## Set up and check a change

Use Node.js 22.22.2, 24.15.0, or 26 or later, and pnpm 10.

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
```

These checks need no cloud credentials. Follow the [project guide](../cli/project-readme.md) to configure Neon Postgres and Neon Auth before `pnpm dev` or `pnpm test:integration`. The integration suite fails when credentials are missing. It uses its own temporary Neon branch, Neon Auth test users, and local Worker, and keeps evidence in `.audit`. The branch does not expire automatically. If the process is killed, remove only the exact recorded child branch. Deleting that branch also removes its test users and sessions.

For CLI or template changes, also run `cli/scripts/smoke.sh` and `cli/scripts/next-steps.sh`. The first creates a project from a packed tarball and runs the generated project's checks. The second checks setup instructions and the failure from unconfigured development startup. Mark new template files with `git add -N` before packing.

Coding agents can use `.agents/skills/verify/SKILL.md` to select the app or CLI driver. Capture the browser state before and after changes, verify database side effects, and keep cleanup evidence.

## Open a pull request

Keep each pull request focused. Use [Conventional Commits](https://www.conventionalcommits.org/), describe the resulting behavior, and include the checks you ran. State any missing live-test prerequisites without claiming a skip as a passing end-to-end test.

Pull requests run without live-test secrets. Never use `pull_request_target` to execute contributor code with secrets.

## Configure trusted live tests

Create protected GitHub environments named `integration` and `release`. Require reviewers, and limit `integration` deployments to trusted branches. Limit `release` deployments to the release tags that maintainers create. Approve an environment run only after reviewing the code at its selected ref.

The Neon GitHub integration supplies the repository secret `NEON_API_KEY` and repository variable `NEON_PROJECT_ID`. Add repository variable `NEON_BRANCH_ID` for the test parent. Both protected environments can use these repository values. Environment values can override them when separate projects are required:

| Kind               | Names                                  |
| ------------------ | -------------------------------------- |
| Secrets            | `NEON_API_KEY`                         |
| Variables          | `NEON_PROJECT_ID`, `NEON_BRANCH_ID`    |
| Optional variables | `NEON_DATABASE_NAME`, `NEON_ROLE_NAME` |

Use an API key scoped to an isolated nonproduction Neon project on AWS without IP Allow or Private Networking. Use an empty parent database or the current owner-aware schema. The suite copies the configured parent branch and never migrates or configures that parent. It retrieves or enables Auth on the child, disables required email verification there, confirms settings, and trusts only the owned local Worker's exact origin. Database and role names default to `neondb` and `neondb_owner`. No Cloudflare account credentials are needed for the local Worker used by the suite.

CI requests the `integration` environment on workflow dispatch, or on trusted pushes to `main` and `staging` when the repository variable `RUN_LIVE_INTEGRATION=true`. The default checks must pass first. A release requests `pnpm test:integration` in the `release` environment. Missing configuration fails the job. The suite uses plain Playwright signup and signin through same-origin cookies. It does not prove email delivery. Follow the [manual email recipe](../.agents/skills/verify-mercury/features/authentication.md#check-email-with-a-real-inbox) for verification, resend, and password recovery.

The suite records owned resource IDs in `.audit/integration-*/neon-branch.json` and `.audit/integration-*/browser/neon-auth-users.json`. Cleanup deletes the child branch and its auth state. If the process is killed or cleanup fails, remove only the recorded child branch ID in the configured Neon project. Keep the parent branch. Do not rely on automatic branch expiration.

CI and the release workflow upload allowlisted text evidence after redacting secret values, database connection URLs, and tokens. Environment files and raw browser screenshots are excluded from that artifact. Keep all added evidence free of credentials.

## Release

Configure npm trusted publishing for this repository's `.github/workflows/release.yml` workflow and `release` environment. Push a `v*` tag matching `cli/package.json`. The workflow checks live-test configuration, installs Chromium, and requires `pnpm test:integration` to pass for real Neon Postgres and Neon Auth. It then packs the tagged CLI, runs credential-free smoke checks against that tarball, and publishes that same tarball with provenance. A failed live test, failed cleanup, or missing configuration blocks npm publication.
