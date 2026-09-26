#!/usr/bin/env bash
# Stop the processes and database of ONE run and delete its scratch dir.
# Keeps $RUN/evidence and $RUN/logs. Safe to run twice.
# Usage: down.sh [run-dir]   (defaults to $VERIFY_RUN)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_run "${1:-}"

stop_group() { # pgid, name
  local pgid=$1
  pgid_alive "$pgid" || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in $(seq 20); do pgid_alive "$pgid" || return 0; sleep 0.25; done
  echo "$2 ignored SIGTERM; sending SIGKILL" >&2
  kill -KILL -- "-$pgid" 2>/dev/null || true
}
stop_group "${WEB_PGID:-}" web
stop_group "${API_PGID:-}" api

if [ -f "$RUN/scratch/pgdata/postmaster.pid" ]; then
  "$PG_BIN/pg_ctl" -D "$RUN/scratch/pgdata" -m fast -w stop > /dev/null || true
fi
rm -rf "$RUN/scratch"
date -Is > "$RUN/DOWN"
echo "stopped $RUN_ID; evidence kept in $RUN/evidence, logs in $RUN/logs"
