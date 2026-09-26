#!/usr/bin/env python3
"""Drive the web UI of a verification run with headless Chromium (Playwright).

Usage: drive.py <label> '<step>' ['<step>' ...]

Runs all steps in one browser session against $VERIFY_RUN's web URL and writes
evidence to $VERIFY_RUN/evidence/<label>/: steps.log, console.log, network.log,
NN-<name>.png + NN-<name>.aria.txt for each `shot`, and FAILED.png on failure.
Exits 1 on the first failed step.

Steps (shell-quoted; ROLE is an ARIA role such as button, link, textbox, heading):
  goto PATH                     open PATH (e.g. /todos) and wait for network idle
  click ROLE NAME               click the element with that role and accessible name
  fill ROLE NAME VALUE          replace the element's value
  press KEY                     keyboard press on the page (e.g. d, Enter)
  expect ROLE NAME              element with role+name is visible
  expect-value ROLE NAME VALUE  form control's current value equals VALUE ("" for empty)
  expect-text TEXT              TEXT is visible somewhere on the page
  expect-no-text TEXT           TEXT is not visible on the page
  expect-url PATH               current path equals PATH
  expect-js JS VALUE            str(eval(JS)) == VALUE, e.g. document.documentElement.className
  wait-response METHOD PATH     wait for the next METHOD PATH response (arm BEFORE the action
                                that triggers it: put it on the same step via `&&`, see below)
  shot NAME                     screenshot + ARIA snapshot of <body>

Chain with `&&` inside one step to arm a response wait around an action:
  'wait-response POST /api/todos && click button Add'
"""

import json
import os
import re
import shlex
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def load_state(run: Path) -> dict:
    state = {}
    for line in (run / "state.env").read_text().splitlines():
        key, _, value = line.partition("=")
        state[key] = shlex.split(value)[0] if value else ""
    return state


# Covers React Query's default 3 retries (~7s) before a failed request renders its error state.
expect.set_options(timeout=15_000)


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return 2
    run = Path(os.environ.get("VERIFY_RUN") or sys.exit("export VERIFY_RUN first (printed by up.sh)"))
    state = load_state(run)
    base = state["WEB_URL"]
    label, steps = sys.argv[1], sys.argv[2:]
    out = run / "evidence" / label
    out.mkdir(parents=True, exist_ok=True)
    log = (out / "steps.log").open("a")
    console = (out / "console.log").open("a")
    network = (out / "network.log").open("a")
    shots = len(list(out.glob("*.png")))

    def note(msg: str) -> None:
        print(msg)
        log.write(msg + "\n")
        log.flush()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1000, "height": 700})
        page.on("console", lambda m: console.write(f"[{m.type}] {m.text}\n"))
        page.on("pageerror", lambda e: console.write(f"[pageerror] {e}\n"))

        def on_response(resp):
            if "/api/" not in resp.url:
                return
            req = resp.request
            body = ""
            try:
                body = resp.text()
            except Exception:
                pass
            network.write(json.dumps({
                "method": req.method, "url": resp.url, "status": resp.status,
                "request": req.post_data, "response": body[:2000],
            }) + "\n")
            network.flush()

        page.on("response", on_response)

        def run_step(words: list[str]) -> None:
            nonlocal shots
            op, args = words[0], words[1:]
            if op == "goto":
                page.goto(base + args[0], wait_until="networkidle")
            elif op == "click":
                page.get_by_role(args[0], name=args[1], exact=True).click()
            elif op == "fill":
                page.get_by_role(args[0], name=args[1], exact=True).fill(args[2])
            elif op == "press":
                page.keyboard.press(args[0])
            elif op == "expect":
                expect(page.get_by_role(args[0], name=args[1], exact=True)).to_be_visible()
            elif op == "expect-value":
                expect(page.get_by_role(args[0], name=args[1], exact=True)).to_have_value(args[2])
            elif op == "expect-text":
                expect(page.get_by_text(args[0], exact=True).first).to_be_visible()
            elif op == "expect-no-text":
                expect(page.get_by_text(args[0], exact=True)).to_have_count(0)
            elif op == "expect-url":
                expect(page).to_have_url(re.compile(re.escape(base + args[0]) + r"$"))
            elif op == "expect-js":
                page.wait_for_function(f"String({args[0]}) === {json.dumps(args[1])}", timeout=15_000)
            elif op == "shot":
                shots += 1
                stem = out / f"{shots:02d}-{args[0]}"
                page.screenshot(path=f"{stem}.png", full_page=True)
                Path(f"{stem}.aria.txt").write_text(page.locator("body").aria_snapshot())
                note(f"      saved {stem}.png, {stem}.aria.txt")
            else:
                raise ValueError(f"unknown step {op!r}")

        for step in steps:
            parts = [shlex.split(s) for s in step.split(" && ")]
            note(f"step  {step}")
            try:
                if parts[0][0] == "wait-response":
                    method, path = parts[0][1], parts[0][2]
                    with page.expect_response(
                        lambda r: r.request.method == method and r.url.endswith(path)
                    ) as info:
                        for words in parts[1:]:
                            run_step(words)
                    note(f"      {method} {path} -> {info.value.status}")
                else:
                    for words in parts:
                        run_step(words)
            except Exception as e:
                note(f"FAIL  {type(e).__name__}: {str(e).splitlines()[0]}")
                page.screenshot(path=str(out / "FAILED.png"), full_page=True)
                note(f"      saved {out / 'FAILED.png'}")
                browser.close()
                return 1
        note(f"pass  {label}: {len(steps)} steps, evidence in {out}")
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
