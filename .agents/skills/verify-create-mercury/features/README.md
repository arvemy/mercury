# create-mercury verification map

This directory is the maintained source for verifying what a user sees and gets from `pnpm create mercury`. Read this index before driving the CLI. Then follow the matching feature file as the recipe. Commands assume `S=.agents/skills/verify-create-mercury/scripts`, run from the repo root.

## Baseline preconditions

- Pack a fresh run with `eval "$($S/pack.sh)"` from the commit under test.
- Run `$S/doctor.sh` and require every line to be `ok`.
- Recipes that install need network access to the npm registry. Everything else is offline.

## Driving conventions

- Every `drive.py` call starts in an empty work dir of its own, so recipes don't depend on each other.
- Use one label per call, named after the sub-feature ID, for example `scaffold-named`. A label can be used once per run.
- Wait on stable strings from the SKILL.md list, not on timing.
- Check files with `expect-path`, `expect-no-path`, and `expect-cmd`, relative to the work dir.

## Proof and skip reporting

- CLI proof is the `steps.log` pass line, the `exit N` line, and a `snap` of the screen at the moment that matters.
- File proof is the `expect-cmd` lines in `steps.log` plus `tree.txt`.
- If you cannot reach an entry point, report the command you tried and the precondition that was missing, such as no network. Do not report it as verified through some other path.

## Feature entry contract

Each feature file has an H1 and a one-paragraph description. Then come four H2s, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.py` (starting with `Preconditions:`), and `Gotchas`.

## Features

- [Scaffold a named project](./scaffold.md) covers `pnpm create mercury my-app` end to end: files, name, page title, env file, git history, install, and next steps.
- [Interactive prompt](./prompt.md) covers running with no name in a terminal, re-asking after an invalid name, and Ctrl-C.
- [Refusals](./refusals.md) covers a non-empty target, an invalid name argument, and a missing name without a terminal.
- [Install failure](./install-failure.md) covers what the user is left with when `pnpm install` fails.
- [Template contents](./template-contents.md) covers what ships in a generated project and what must not, and that its lockfile installs frozen.
