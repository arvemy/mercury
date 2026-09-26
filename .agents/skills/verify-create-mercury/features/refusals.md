# Refusals

The CLI refuses to start rather than write somewhere wrong. A non-empty target, an invalid name argument, and a missing name without a terminal each exit 1 with a message and touch nothing.

## Sub-features

- `refuse-nonempty` exits 1 with `<path> already exists and is not empty.` and leaves the directory as it was.
- `refuse-bad-name` exits 1 with the naming rule for an argument such as `../escape` or `My-App`.
- `refuse-no-tty` exits 1 with `Usage: pnpm create mercury <project-name>` when no name is given and stdin is not a terminal.

## How to get to it (user POV)

- Run `pnpm create mercury my-app` where `my-app` already has files in it.
- Run `pnpm create mercury ../escape`.
- Run `pnpm create mercury` from a script or CI job with no name.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`. No network access is needed.

- **Non-empty target.** Run `$S/drive.py refuse-nonempty 'pre "mkdir taken && echo keep > taken/keep.txt"' 'run-piped taken' 'expect-exit 1' 'expect-text "already exists and is not empty."' 'expect-cmd "ls -A taken" keep.txt' 'snap refused'`.
- **Bad name argument.** Run `$S/drive.py refuse-bad-name 'run-piped ../escape' 'expect-exit 1' 'expect-text "Project name must be lowercase"' 'expect-no-path ../escape' 'expect-cmd "ls -A" ""' 'snap refused'`.
- **No terminal.** Run `$S/drive.py refuse-no-tty 'run-piped' 'expect-exit 1' 'expect-text "Usage: pnpm create mercury <project-name>"' 'expect-cmd "ls -A" ""' 'snap usage'`.

## Gotchas

- An existing but empty directory is allowed. Only a directory with entries is refused.
- `expect-no-path ../escape` checks the evidence parent, `$VERIFY_CLI_RUN/work/`, so a leak there fails the drive.
