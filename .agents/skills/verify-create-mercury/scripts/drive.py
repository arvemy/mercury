#!/usr/bin/env python3
"""Drive create-mercury the way a user does, one label per call.

Usage: drive.py <label> '<step>' '<step>' ...
Needs VERIFY_CLI_RUN (printed by pack.sh). Each call gets a fresh work dir
$VERIFY_CLI_RUN/work/<label>/ and its own tmux session, and writes evidence to
$VERIFY_CLI_RUN/evidence/<label>/: steps.log, NN-<name>.txt snapshots,
transcript.txt, tree.txt, and FAILED.txt on failure.

Steps (shell-quoted; paths and commands are relative to the work dir):
  env KEY=VALUE             add an env var to the next run or run-piped;
                            $WORK in VALUE expands to this drive's work dir
  pre CMD                   run a shell command before the CLI (e.g. mkdir x)
  run [ARGS...]             start `pnpm dlx <tarball> ARGS` in a real terminal
  run-piped [ARGS...]       run it with stdin from /dev/null (no TTY), wait for exit
  wait TEXT [SECONDS]       wait until TEXT appears in the terminal (default 60s)
  type TEXT                 type TEXT without pressing Enter
  key KEY                   send a tmux key: Enter, C-c, Escape, ...
  expect-exit CODE          wait for the CLI to exit (up to 300s) and check its code
  expect-text TEXT          TEXT appears in the output so far
  expect-no-text TEXT       TEXT does not appear in the output so far
  expect-path PATH          PATH exists
  expect-no-path PATH       PATH does not exist
  expect-cmd CMD EXPECTED   `bash -c CMD` prints exactly EXPECTED (trimmed)
  snap NAME                 save the output so far as NN-NAME.txt
"""
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

EXIT_MARK = re.compile(r"__VCM_EXIT__(\d+)__")


def load_state():
    run = os.environ.get("VERIFY_CLI_RUN")
    if not run:
        sys.exit("error: export VERIFY_CLI_RUN first (printed by pack.sh)")
    state = {}
    for line in (Path(run) / "state.env").read_text().splitlines():
        key, _, value = line.partition("=")
        state[key] = value
    return state


class Drive:
    def __init__(self, label, state):
        self.state = state
        self.socket = state["TMUX_SOCKET"]
        self.session = f"drive-{label}"
        run = Path(state["RUN"])
        self.work = run / "work" / label
        self.out = run / "evidence" / label
        if self.work.exists() or self.out.exists():
            sys.exit(f"error: label {label} was already used in this run; pick a new one")
        self.work.mkdir(parents=True)
        self.out.mkdir(parents=True)
        self.log = (self.out / "steps.log").open("w")
        self.env = {}
        self.mode = None
        self.piped = ""
        self.piped_exit = None
        self.snaps = 0

    def note(self, text):
        print(text)
        self.log.write(text + "\n")
        self.log.flush()

    def tmux(self, *args, check=True):
        return subprocess.run(
            ["tmux", "-L", self.socket, *args],
            capture_output=True, text=True, check=check,
        )

    def command(self, args):
        env = " ".join(f"{k}={shlex.quote(v)}" for k, v in self.env.items())
        cli = shlex.join(["pnpm", "dlx", self.state["TARBALL"], *args])
        self.env = {}
        return f"{'env ' + env + ' ' if env else ''}{cli}"

    def output(self):
        if self.mode == "piped":
            return self.piped
        if self.mode != "tty":
            return ""
        return self.tmux("capture-pane", "-p", "-J", "-S", "-", "-t", self.session).stdout

    def exit_code(self):
        if self.mode == "piped":
            return self.piped_exit
        found = EXIT_MARK.findall(self.output())
        return int(found[-1]) if found else None

    def poll(self, predicate, seconds, what):
        deadline = time.time() + seconds
        while time.time() < deadline:
            if predicate():
                return
            time.sleep(0.25)
        raise AssertionError(f"timed out after {seconds}s waiting for {what}")

    def step(self, name, args):
        if name == "env":
            key, _, value = args[0].partition("=")
            self.env[key] = value.replace("$WORK", str(self.work))
        elif name == "pre":
            subprocess.run(["bash", "-c", args[0]], cwd=self.work, check=True)
        elif name == "run":
            self.mode = "tty"
            self.tmux(
                "new-session", "-d", "-s", self.session, "-x", "200", "-y", "50",
                "-c", str(self.work), "env PS1='$ ' bash --norc --noprofile",
            )
            self.tmux("set-option", "-t", self.session, "history-limit", "50000")
            self.tmux("send-keys", "-t", self.session, "-l",
                      f"{self.command(args)}; echo __VCM_EXIT__$?__")
            self.tmux("send-keys", "-t", self.session, "Enter")
        elif name == "run-piped":
            self.mode = "piped"
            result = subprocess.run(
                ["bash", "-c", self.command(args)], cwd=self.work,
                stdin=subprocess.DEVNULL, capture_output=True, text=True,
            )
            self.piped = result.stdout + result.stderr
            self.piped_exit = result.returncode
        elif name == "wait":
            seconds = float(args[1]) if len(args) > 1 else 60
            self.poll(lambda: args[0] in self.output(), seconds, repr(args[0]))
        elif name == "type":
            self.tmux("send-keys", "-t", self.session, "-l", args[0])
        elif name == "key":
            self.tmux("send-keys", "-t", self.session, args[0])
        elif name == "expect-exit":
            self.poll(lambda: self.exit_code() is not None, 300, "the CLI to exit")
            code = self.exit_code()
            self.note(f"      exit {code}")
            assert code == int(args[0]), f"exit code {code}, expected {args[0]}"
        elif name == "expect-text":
            assert args[0] in self.output(), f"{args[0]!r} not in output"
        elif name == "expect-no-text":
            assert args[0] not in self.output(), f"{args[0]!r} is in output"
        elif name == "expect-path":
            assert (self.work / args[0]).exists(), f"{args[0]} does not exist"
        elif name == "expect-no-path":
            assert not (self.work / args[0]).exists(), f"{args[0]} exists"
        elif name == "expect-cmd":
            result = subprocess.run(
                ["bash", "-c", args[0]], cwd=self.work, capture_output=True, text=True,
            )
            got = result.stdout.strip()
            self.note(f"      {args[0]} -> {got!r}")
            assert got == args[1], f"got {got!r}, expected {args[1]!r}"
        elif name == "snap":
            self.snaps += 1
            path = self.out / f"{self.snaps:02d}-{args[0]}.txt"
            path.write_text(self.output())
            self.note(f"      saved {path}")
        else:
            raise ValueError(f"unknown step {name!r}; see drive.py --help")

    def finish(self, failed):
        (self.out / ("FAILED.txt" if failed else "transcript.txt")).write_text(self.output())
        tree = subprocess.run(
            ["find", ".", "-maxdepth", "2", "-not", "-path", "*/node_modules*",
             "-not", "-path", "*/.git/*"],
            cwd=self.work, capture_output=True, text=True,
        ).stdout
        (self.out / "tree.txt").write_text(tree)
        self.tmux("kill-session", "-t", self.session, check=False)


def main():
    if len(sys.argv) < 3 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if len(sys.argv) > 1 else 2)
    label, steps = sys.argv[1], sys.argv[2:]
    drive = Drive(label, load_state())
    for raw in steps:
        name, *args = shlex.split(raw)
        drive.note(f"step  {raw}")
        try:
            drive.step(name, args)
        except Exception as error:
            drive.note(f"FAIL  {error}")
            drive.finish(failed=True)
            drive.note(f"      evidence in {drive.out}")
            sys.exit(1)
    drive.finish(failed=False)
    drive.note(f"pass  {label}: {len(steps)} steps, evidence in {drive.out}")


if __name__ == "__main__":
    main()
