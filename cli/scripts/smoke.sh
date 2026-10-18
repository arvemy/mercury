#!/usr/bin/env bash
set -euo pipefail

cli_dir=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ $# -gt 0 ]; then
  tarball=$(realpath "$1")
else
  pnpm --dir "$cli_dir" pack --pack-destination "$work" >/dev/null
  tarball=$(find "$work" -maxdepth 1 -name 'create-mercury-*.tgz' -print -quit)
fi
[ -f "$tarball" ] || { echo "smoke: CLI tarball not found" >&2; exit 1; }

cd "$work"
env -u DATABASE_URL -u NEON_AUTH_BASE_URL -u NEON_AUTH_COOKIE_SECRET -u NEON_API_KEY -u NEON_PROJECT_ID -u NEON_BRANCH_ID pnpm dlx "$tarball" smoke-app
cd smoke-app
rg -q '<title>smoke-app</title>' apps/web/index.html || { echo "smoke: page title not set"; exit 1; }

for file in .gitignore .npmrc .mcp.json apps/api/.env apps/web/.env.local apps/web/.dev.vars apps/web/cloudflare.config.ts; do
  [ -f "$file" ] || { echo "smoke: missing $file"; exit 1; }
done
[ "$(git rev-list --count HEAD)" = 1 ] || { echo "smoke: expected one initial commit"; exit 1; }
[ ! -e docker-compose.yml ] || { echo "smoke: old Docker Compose template shipped"; exit 1; }
[ ! -d cli ] || { echo "smoke: CLI source shipped in template"; exit 1; }
[ "$(find .github -type f)" = .github/workflows/ci.yml ] || { echo "smoke: unexpected repository workflow shipped"; exit 1; }

for skill in .agents/skills/*; do
  [ -f "$skill/SKILL.md" ] || continue
  [ -f ".claude/skills/$(basename "$skill")/SKILL.md" ] || { echo "smoke: unlinked skill $skill"; exit 1; }
done

for task in format:check lint typecheck build test test:worker db:generate; do
  echo "smoke: pnpm $task"
  env -u DATABASE_URL -u NEON_AUTH_BASE_URL -u NEON_AUTH_COOKIE_SECRET -u NEON_API_KEY -u NEON_PROJECT_ID -u NEON_BRANCH_ID pnpm "$task"
done
[ -z "$(git status --porcelain -- apps/api/drizzle)" ] || { echo "smoke: db:generate changed committed migrations"; exit 1; }

echo "smoke: generated project passed without service credentials"
