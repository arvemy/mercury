#!/usr/bin/env bash
# Tear down a run: kill its private tmux server and delete generated projects.
# Keeps evidence/ and logs/. Safe to run twice.
# Usage: down.sh [run-dir]   (defaults to $VERIFY_CLI_RUN)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_run "${1:-}"

tmux -L "$TMUX_SOCKET" kill-server 2>/dev/null || true
rm -rf "$RUN/work" "$TARBALL"
touch "$RUN/DOWN"
echo "stopped $RUN_ID; evidence kept in $RUN/evidence, logs in $RUN/logs"
