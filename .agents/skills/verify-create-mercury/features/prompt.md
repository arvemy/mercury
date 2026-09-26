# Interactive prompt

Run with no name in a terminal, and the CLI asks `Project name: `. An invalid name prints the naming rule and asks again. Ctrl-C at the prompt exits without creating anything.

## Sub-features

- `prompt-name` accepts a typed name and scaffolds that project.
- `prompt-invalid` prints the naming rule and asks again after an invalid name.
- `prompt-interrupt` exits with code 130 on Ctrl-C, prints no stack trace, and writes no directory.

## How to get to it (user POV)

- Run `pnpm create mercury` with no name, in a terminal.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`. Only `prompt-name` needs network access.

- **Invalid name, then Ctrl-C.** Run `$S/drive.py prompt-interrupt 'run' 'wait "Project name:"' 'type "My App"' 'key Enter' 'wait "must be lowercase"' 'snap reprompt' 'key C-c' 'expect-exit 130' 'expect-no-text "    at "' 'expect-cmd "ls -A" ""'`.
  `01-reprompt.txt` shows the rule followed by a second `Project name:`. The work dir stays empty.
- **Typed name.** Run `$S/drive.py prompt-name 'run' 'wait "Project name:"' 'type prompt-app' 'key Enter' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'expect-cmd "jq -r .name prompt-app/package.json" prompt-app' 'snap done'`.

## Gotchas

- The prompt only appears with a TTY. `run-piped` with no name prints the usage line instead (see [Refusals](./refusals.md)).
- Leading and trailing spaces in a typed name are trimmed before validation.
- The prompt is `node:readline`, so use `type` then `key Enter`, not a single step with a newline.
