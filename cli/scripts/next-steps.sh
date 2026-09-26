#!/usr/bin/env bash
# Creates a project with the packed CLI, then runs the next steps it prints,
# the way a user would. Needs Docker and free ports 3000, 5173, and 5432.
set -euo pipefail

cli_dir=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
dev_pid=

cleanup() {
  if [ -n "$dev_pid" ]; then
    kill -- "-$dev_pid" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.2; done
    kill -KILL -- "-$dev_pid" 2>/dev/null || true
  fi
  if [ -d "$work/next-app" ]; then
    (cd "$work/next-app" && docker compose down -v >/dev/null 2>&1) || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

wait_for() {
  local url=$1 expected=$2 body=
  for _ in $(seq 1 120); do
    body=$(curl -fsS "$url" 2>/dev/null) && [ "$body" = "$expected" ] && {
      echo "next-steps: $url -> $body"
      return 0
    }
    sleep 1
  done
  echo "next-steps: $url never returned $expected (last: ${body:-no response})"
  tail -40 "$work/dev.log"
  return 1
}

pnpm --dir "$cli_dir" pack --pack-destination "$work" >/dev/null
tarball=$(ls "$work"/create-mercury-*.tgz)

cd "$work"
pnpm dlx "$tarball" next-app | tee "$work/create.log"

mapfile -t steps < <(sed -n '/^Done. Next steps:/,$ s/^  \(..*\)$/\1/p' "$work/create.log")
[ "${#steps[@]}" -gt 0 ] || { echo "next-steps: the CLI printed no next steps"; exit 1; }
echo "next-steps: running ${steps[*]}"

for step in "${steps[@]:0:${#steps[@]}-1}"; do eval "$step"; done
setsid bash -c "${steps[-1]}" > "$work/dev.log" 2>&1 &
dev_pid=$!

wait_for http://localhost:5173/api/health '{"status":"ok"}'
wait_for http://localhost:5173/api/todos '[]'
echo "next-steps: the printed next steps started a working app"
