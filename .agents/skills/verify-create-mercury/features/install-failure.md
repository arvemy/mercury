# Install failure

When `pnpm install` fails, the CLI keeps the generated files, prints the commands to retry, and exits 1. The user can fix their network and rerun the install without starting over.

## Sub-features

- `install-offline` keeps the scaffolded project, prints `pnpm install failed. Run it again with:` followed by `cd <name>` and `pnpm install`, and exits 1.

## How to get to it (user POV)

- Run `pnpm create mercury my-app` while offline, or when the registry is unreachable.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`. No network access is needed.

- **Offline install.** Run `$S/drive.py install-offline 'env npm_config_offline=true' 'env npm_config_store_dir=$WORK/empty-store' 'run offline-app' 'wait "pnpm install failed" 120' 'expect-exit 1' 'snap failure' 'expect-text "cd offline-app"' 'expect-path offline-app/package.json' 'expect-path offline-app/apps/api/.env' 'expect-cmd "git -C offline-app rev-parse --is-inside-work-tree" true' 'expect-cmd "git -C offline-app rev-list --all --count" 0'`.
  `01-failure.txt` shows pnpm's `ERR_PNPM_NO_OFFLINE_TARBALL` followed by the retry commands.

## Gotchas

- Keep `$WORK` in single quotes so the shell passes it through and `drive.py` expands it. An empty store is what makes offline mode fail. With the user's warm store, offline mode can succeed.
- `pnpm dlx` itself must be able to read the tarball. It installs the CLI from the local file before the offline env reaches the inner `pnpm install`.
- No commit is made when the install fails, so the repo has zero commits.
