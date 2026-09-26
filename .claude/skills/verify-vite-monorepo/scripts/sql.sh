#!/usr/bin/env bash
# Run a read-only SQL query against the run's database and save it as evidence.
# Usage: sql.sh <label> "<sql>"   -> prints and writes $VERIFY_RUN/evidence/<label>/db-<n>.txt
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_run
[ $# -eq 2 ] || die "usage: sql.sh <label> \"<sql>\""
out=$RUN/evidence/$1
mkdir -p "$out"
n=$(( $(find "$out" -name 'db-*.txt' | wc -l) + 1 ))
file=$out/db-$n.txt
{ echo "-- $2"; psql -X "$DATABASE_URL" -c "begin read only" -c "$2" -c "rollback" 2>&1 | grep -v -x -E 'BEGIN|ROLLBACK'; } | tee "$file"
echo "saved $file" >&2
