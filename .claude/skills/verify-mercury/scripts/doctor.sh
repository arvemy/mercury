#!/usr/bin/env bash
# Read-only: is this run's stack worth driving? Exits 1 on any FAIL.
# Usage: doctor.sh [run-dir]   (defaults to $VERIFY_RUN)
set -uo pipefail
source "$(dirname "$0")/lib.sh"
load_run "${1:-}"

status=0
ok() { echo "ok    $*"; }
bad() { echo "FAIL  $*"; status=1; }

echo "run   $RUN"
[ -f "$RUN/DOWN" ] && bad "run was torn down at $(cat "$RUN/DOWN")"

port_owner_pgid() { # port -> pgid of the listening process
  local pid
  pid=$(ss -Htlnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  [ -n "$pid" ] && ps -o pgid= -p "$pid" | tr -d ' '
}

for svc in API WEB; do
  pgid_var=${svc}_PGID port_var=${svc}_PORT
  pgid=${!pgid_var} port=${!port_var}
  if ! pgid_alive "$pgid"; then bad "$svc process group $pgid is gone (see $RUN/logs)"; continue; fi
  owner=$(port_owner_pgid "$port")
  if [ "$owner" = "$pgid" ]; then ok "$svc :$port owned by our pgid $pgid"
  else bad "$svc :$port owned by pgid '${owner:-none}', expected $pgid"; fi
done

if "$PG_BIN/pg_ctl" -D "$RUN/scratch/pgdata" status > /dev/null 2>&1; then
  count=$(psql -XAtq "$DATABASE_URL" -c 'select count(*) from todos' 2>&1) \
    && ok "postgres :$PG_PORT up, todos table has $count rows" \
    || bad "postgres query failed: $count"
else
  bad "postgres not running for $RUN/scratch/pgdata"
fi

health=$(curl -fsS "$WEB_URL/api/health" 2>&1)
[ "$health" = '{"status":"ok"}' ] && ok "web proxy -> api health: $health" || bad "health via $WEB_URL/api/health: $health"

head_now=$(git -C "$REPO" rev-parse --short HEAD)
dirty=$(git -C "$REPO" status --porcelain -- apps packages | wc -l)
if [ "$head_now" = "$GIT_HEAD" ]; then ok "git HEAD $head_now ($dirty uncommitted file(s) under apps/ packages/; dev servers hot-reload them)"
else echo "warn  started at $GIT_HEAD, HEAD is now $head_now; restart if migrations or deps changed"; fi

exit $status
