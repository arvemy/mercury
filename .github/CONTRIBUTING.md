# Contributing to Mercury

Thanks for helping. This guide covers how the repository works and how to get a change merged.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). Report security issues privately, as the [security policy](SECURITY.md) describes.

## How the repository works

The repository root is the template. It is a working Mercury app, and `cli/` holds `create-mercury`, which packs a snapshot of the root into new projects.

- `cli/scripts/snapshot.ts` decides what ships. Repo-only files go in its `EXCLUDED` list. From `.github/`, only `workflows/ci.yml` ships.
- `cli/project-readme.md` is the README that generated projects get. `README.md` is this repository's landing page.

## Set up

You need Node.js 22.22, 24.15, or 26 or later, pnpm 10, and Docker.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts PostgreSQL in Docker, applies migrations, and runs the web app and the API. `pnpm dev:apps` runs only the web app and the API.

## Check a change

Run the same checks as CI before you open a pull request:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

For a change to a Dockerfile, the `Caddyfile`, or `docker-compose.yml`, also run `pnpm prod` and check http://localhost:8080. CI's `docker` job runs the same stack and checks it.

For a change to `cli/` or to anything that ships in the template, also run:

- `cli/scripts/smoke.sh`, with `DATABASE_URL` set. It creates a project from the packed CLI and runs its migrations, format check, lint, typecheck, build, and tests.
- `cli/scripts/next-steps.sh`. It creates a project and runs the next steps the CLI prints. It needs Docker.

Coding agents can use the `verify-mercury` and `verify-create-mercury` skills in `.agents/skills` to drive the real app and the real CLI.

## Open a pull request

- Keep each pull request to one change. Put unrelated changes in separate pull requests.
- Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/), such as `fix(cli): keep files when pnpm install fails`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.
- Say what changed for someone who creates a project, and how you checked it.
- `main` accepts only pull requests. The `ci`, `smoke`, `compose-db`, and `next-steps` checks must pass. Pull requests are squash-merged.

## Releases

The maintainer releases by pushing a `v*` tag that matches the version in `cli/package.json`. The release workflow waits for approval in the `release` environment, runs the smoke test, and publishes to npm with provenance.
