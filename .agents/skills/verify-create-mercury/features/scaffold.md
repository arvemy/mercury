# Scaffold a named project

`pnpm create mercury my-app` creates `my-app/` from the template, names the project, writes the API env file, makes it a git repo with one commit, installs dependencies, and prints the commands to start it.

## Sub-features

- `scaffold-named` creates the project with `package.json` name `my-app` and the browser tab title `my-app`.
- `scaffold-files` restores `.gitignore` and `.npmrc` and writes `apps/api/.env` from `.env.example`.
- `scaffold-git` leaves exactly one commit, `Initial commit from create-mercury`, and a clean working tree.
- `scaffold-install` installs dependencies, so `node_modules` exists and husky's hook dir is set up.
- `scaffold-next-steps` prints `Done. Next steps:` with `cd my-app`, `docker compose up -d db`, `pnpm db:migrate`, and `pnpm dev`.

## How to get to it (user POV)

- Run `pnpm create mercury my-app` in any directory where `my-app` does not exist yet or is empty.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`, and network access for the install.

- **All sub-features in one drive.** Run:

  ```
  $S/drive.py scaffold-named 'run my-app' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'snap next-steps' 'expect-text "cd my-app"' 'expect-text "docker compose up -d db"' 'expect-text "pnpm db:migrate"' 'expect-text "pnpm dev"' 'expect-cmd "jq -r .name my-app/package.json" my-app' 'expect-cmd "grep -o \"<title>.*</title>\" my-app/apps/web/index.html" "<title>my-app</title>"' 'expect-path my-app/.gitignore' 'expect-path my-app/.npmrc' 'expect-no-path my-app/_gitignore' 'expect-cmd "cmp my-app/apps/api/.env my-app/apps/api/.env.example && echo same" same' 'expect-cmd "git -C my-app log --format=%s" "Initial commit from create-mercury"' 'expect-cmd "git -C my-app status --porcelain" ""' 'expect-path my-app/node_modules' 'expect-cmd "git -C my-app config core.hooksPath" ".husky/_"'
  ```

  `steps.log` shows `exit 0` and each `expect-cmd` result. `01-next-steps.txt` shows the printed commands.

## Gotchas

- The install takes about 25 s with a cold pnpm store and about 1.5 s with a warm one. Give `wait` 180 s.
- The initial commit uses `--no-verify`, so the template's lint-staged hook does not run on it.
- Git needs `user.name` and `user.email`. Without them the CLI warns `git commit failed. Commit the project yourself.` and still exits 0, and `scaffold-git` fails.
