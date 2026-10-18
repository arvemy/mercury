#!/usr/bin/env bash
set -euo pipefail

cli_dir=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

pnpm --dir "$cli_dir" pack --pack-destination "$work" >/dev/null
tarball=$(find "$work" -maxdepth 1 -name 'create-mercury-*.tgz' -print -quit)
cd "$work"
env -u DATABASE_URL -u NEON_AUTH_BASE_URL -u NEON_AUTH_COOKIE_SECRET -u NEON_API_KEY -u NEON_PROJECT_ID -u NEON_BRANCH_ID pnpm dlx "$tarball" next-app | tee "$work/create.log"

for text in 'Done. Next steps:' 'cd next-app' 'README.md' 'Neon' 'Neon Auth' 'pnpm dev'; do
  rg -Fq "$text" "$work/create.log" || { echo "next-steps: missing setup instruction $text" >&2; exit 1; }
done
cd next-app
if env -u DATABASE_URL -u NEON_AUTH_BASE_URL -u NEON_AUTH_COOKIE_SECRET -u NEON_API_KEY -u NEON_PROJECT_ID -u NEON_BRANCH_ID pnpm dev > "$work/dev.log" 2>&1; then
  echo "next-steps: an unconfigured app must fail before starting services" >&2
  exit 1
fi
rg -q 'DATABASE_URL|NEON_AUTH|Neon' "$work/dev.log" || { cat "$work/dev.log" >&2; exit 1; }
echo "next-steps: the CLI explains setup, and unconfigured dev fails with a configuration error"
