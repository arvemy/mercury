# Scaffold a named project

`pnpm create mercury my-app` creates and installs a project without cloud credentials. It names the package, page title, and Worker prefix, copies three local environment examples, initializes Git on `main`, and prints Neon Postgres and Neon Auth setup instructions.

## Sub-features

- `scaffold-named` sets the package name and page title.
- `scaffold-files` restores dotfiles and copies the API migration URL example, Worker configuration, and Worker secrets example.
- `scaffold-git` creates one initial commit on `main` and leaves a clean working tree.
- `scaffold-install` installs dependencies and sets up the pre-commit hook.
- `scaffold-next-steps` explains that Neon Postgres and Neon Auth configuration precede `pnpm dev`.

## How to get to it

Run `pnpm create mercury my-app` in an empty directory.

## Driving it with drive.py

Preconditions:

Pack a fresh run and require `doctor.sh` to pass. Network access and Git user configuration are required for installation and the initial commit.

```sh
$S/drive.py scaffold-named 'run my-app' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'snap next-steps' 'expect-text "cd my-app"' 'expect-text "Follow README.md to connect Neon Postgres and Neon Auth."' 'expect-text "After setup, run pnpm dev."' 'expect-cmd "jq -r .name my-app/package.json" my-app' 'expect-cmd "grep -o \"<title>.*</title>\" my-app/apps/web/index.html" "<title>my-app</title>"' 'expect-path my-app/.gitignore' 'expect-path my-app/.npmrc' 'expect-no-path my-app/_gitignore' 'expect-cmd "cmp my-app/apps/api/.env my-app/apps/api/.env.example && cmp my-app/apps/web/.env.local my-app/apps/web/.env.example && cmp my-app/apps/web/.dev.vars my-app/apps/web/.dev.vars.example && echo same" same' 'expect-cmd "git -C my-app log --format=%s" "Initial commit from create-mercury"' 'expect-cmd "git -C my-app branch --show-current" main' 'expect-cmd "git -C my-app status --porcelain" ""' 'expect-path my-app/node_modules' 'expect-cmd "git -C my-app config core.hooksPath" ".husky/_"'
```

`cli/scripts/next-steps.sh` separately proves that an unconfigured `pnpm dev` fails with an actionable configuration error.

## Gotchas

The CLI never starts development or creates cloud resources. A missing Git identity produces a warning while leaving the project usable. Initial commits use `--no-verify` to avoid running the project's hooks before setup.
