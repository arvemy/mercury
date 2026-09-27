#!/usr/bin/env bash
set -euo pipefail

cli_dir=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

pnpm --dir "$cli_dir" pack --pack-destination "$work" >/dev/null
tarball=$(ls "$work"/create-mercury-*.tgz)

cd "$work"
pnpm dlx "$tarball" smoke-app
cd smoke-app
grep -q "<title>smoke-app</title>" apps/web/index.html || { echo "smoke: page title not set"; exit 1; }

for file in .gitignore .npmrc apps/api/.env; do
  [ -f "$file" ] || { echo "smoke: missing $file"; exit 1; }
done
[ "$(git rev-list --count HEAD)" = 1 ] || { echo "smoke: expected one initial commit"; exit 1; }

for task in db:migrate format:check lint typecheck build test; do
  echo "smoke: pnpm $task"
  pnpm "$task" || { echo "smoke: pnpm $task failed"; exit 1; }
done

echo "smoke: generated project passed format, lint, typecheck, build, test"
