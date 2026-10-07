#!/usr/bin/env bash
# Runs Supabase migrations and RLS tests against Postgres.
# Uses $DATABASE_URL when set (CI); otherwise starts a throwaway local cluster.
set -euo pipefail
cd "$(dirname "$0")/.."

run_psql() { psql -v ON_ERROR_STOP=1 -q "$@"; }

cleanup() { :; }
if [[ -z "${DATABASE_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [[ -x "$PG_BIN/initdb" ]] || { echo "Postgres not found: set DATABASE_URL or PG_BIN" >&2; exit 1; }
  TMP=$(mktemp -d)
  AS=()
  if [[ $(id -u) -eq 0 ]]; then chown postgres "$TMP"; AS=(runuser -u postgres --); fi
  "${AS[@]}" "$PG_BIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
  "${AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -p 54329 -c listen_addresses=''" -w start >/dev/null
  cleanup() { "${AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null || true; rm -rf "$TMP"; }
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi
trap cleanup EXIT

run_psql "$DATABASE_URL" -f supabase/tests/auth_stub.sql
for migration in supabase/migrations/*.sql; do
  echo "→ $migration"
  run_psql "$DATABASE_URL" -f "$migration"
done
run_psql "$DATABASE_URL" -f supabase/tests/auth_stub.sql
echo "→ RLS tests"
run_psql "$DATABASE_URL" -f supabase/tests/rls.sql
echo "→ Workout Coach tests (versions, immutable prescriptions, reconstructed history, RLS)"
run_psql "$DATABASE_URL" -f supabase/tests/training.sql
echo "→ Settings tests (reminder preferences, mass unit, photo storage, FK indexes)"
run_psql "$DATABASE_URL" -f supabase/tests/settings.sql
echo "→ Sync integration tests (real schema + RLS)"
DATABASE_URL="$DATABASE_URL" npx jest --ci src/services/__tests__/sync.db.test.ts
echo "✓ database tests passed"
