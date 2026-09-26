#!/usr/bin/env bash
# Read-only check that this run's tarball is worth driving. Exits 1 on any FAIL.
# Usage: doctor.sh [run-dir]   (defaults to $VERIFY_CLI_RUN)
set -uo pipefail
source "$(dirname "$0")/lib.sh"
load_run "${1:-}"

fails=0
ok() { echo "ok    $*"; }
fail() { echo "FAIL  $*"; fails=$((fails + 1)); }

echo "run   $RUN"
if [ -f "$TARBALL" ]; then ok "tarball $(basename "$TARBALL") ($(stat -c %s "$TARBALL") bytes)"; else fail "tarball $TARBALL missing"; fi

contents=$(tar tzf "$TARBALL" 2>/dev/null)
for f in package/dist/src/index.js package/template/_gitignore package/template/package.json; do
  if grep -qx "$f" <<<"$contents"; then ok "tarball has ${f#package/}"; else fail "tarball lacks ${f#package/}"; fi
done
if grep -q '^package/template/cli/' <<<"$contents"; then fail "template contains cli/"; else ok "template excludes cli/"; fi

head=$(git -C "$REPO" rev-parse --short HEAD)
if [ "$head" = "$GIT_HEAD" ]; then ok "git HEAD $head matches the packed commit"; else fail "HEAD is $head but the tarball was packed at $GIT_HEAD; rerun pack.sh"; fi
[ "$GIT_DIRTY" = 0 ] || echo "note  packed with $GIT_DIRTY modified tracked file(s); the template includes those edits"

sessions=$(tmux -L "$TMUX_SOCKET" list-sessions -F '#S' 2>/dev/null | wc -l)
if [ "$sessions" = 0 ]; then ok "no leftover tmux sessions on socket $TMUX_SOCKET"; else fail "$sessions tmux session(s) still open on $TMUX_SOCKET; run down.sh or finish that drive"; fi

exit $((fails > 0))
