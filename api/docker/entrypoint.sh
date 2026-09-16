#!/usr/bin/env bash
# GridPulse API container entrypoint.
#   1. Works out the database from whatever the host injected (Railway MySQL/Postgres
#      reference variables, a DB_URL, classic DB_* vars, or falls back to SQLite).
#   2. Generates an APP_KEY if none was provided (with a loud warning).
#   3. Waits for the database, migrates, seeds the demo fleet when the DB is empty.
#   4. Caches config/routes, starts the telemetry scheduler, serves HTTP on $PORT.
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
log() { echo "[gridpulse] $*"; }

# --- 1. database -------------------------------------------------------------
if [ -z "${DB_URL:-}" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then export DB_URL="$DATABASE_URL"
  elif [ -n "${MYSQL_URL:-}" ]; then export DB_URL="$MYSQL_URL"
  elif [ -n "${MYSQL_PUBLIC_URL:-}" ]; then export DB_URL="$MYSQL_PUBLIC_URL"
  fi
fi

if [ -n "${DB_URL:-}" ]; then
  case "$DB_URL" in
    mysql://*|mysql2://*)          export DB_CONNECTION=mysql ;;
    postgres://*|postgresql://*)   export DB_CONNECTION=pgsql ;;
    sqlite://*|sqlite3://*)        export DB_CONNECTION=sqlite ;;
    *) log "WARNING: unrecognised DB_URL scheme, using DB_CONNECTION=${DB_CONNECTION:-sqlite}" ;;
  esac
elif [ -n "${MYSQLHOST:-}" ]; then
  export DB_CONNECTION=mysql DB_HOST="$MYSQLHOST" DB_PORT="${MYSQLPORT:-3306}" \
         DB_DATABASE="${MYSQLDATABASE:-railway}" DB_USERNAME="${MYSQLUSER:-root}" DB_PASSWORD="${MYSQLPASSWORD:-}"
elif [ -n "${PGHOST:-}" ]; then
  export DB_CONNECTION=pgsql DB_HOST="$PGHOST" DB_PORT="${PGPORT:-5432}" \
         DB_DATABASE="${PGDATABASE:-railway}" DB_USERNAME="${PGUSER:-postgres}" DB_PASSWORD="${PGPASSWORD:-}"
fi
export DB_CONNECTION="${DB_CONNECTION:-sqlite}"

if [ "$DB_CONNECTION" = "sqlite" ]; then
  export DB_DATABASE="${DB_DATABASE:-$APP_DIR/database/database.sqlite}"
  mkdir -p "$(dirname "$DB_DATABASE")"
  [ -f "$DB_DATABASE" ] || { touch "$DB_DATABASE"; log "created SQLite database at $DB_DATABASE"; }
  log "database: sqlite ($DB_DATABASE) — mount a volume there to keep data between deploys"
else
  log "database: $DB_CONNECTION"
fi

# --- 2. app key ----------------------------------------------------------------
if [ -z "${APP_KEY:-}" ]; then
  export APP_KEY="base64:$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  log "WARNING: APP_KEY not set — generated a temporary one. Set APP_KEY in the service variables"
  log "         (php artisan key:generate --show) so it survives restarts."
fi
export APP_NAME="${APP_NAME:-GridPulse}" APP_ENV="${APP_ENV:-production}" APP_DEBUG="${APP_DEBUG:-false}" LOG_CHANNEL="${LOG_CHANNEL:-stderr}"
export PORT="${PORT:-8000}" PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"

# --- 3. migrate + seed -----------------------------------------------------------
php artisan config:clear >/dev/null
php artisan optimize:clear >/dev/null 2>&1 || true
SEED_FLAG=""; [ "${SEED_DEMO:-true}" = "true" ] && SEED_FLAG="--seed"
php artisan gridpulse:bootstrap --wait="${DB_WAIT_SECONDS:-60}" $SEED_FLAG

# --- 4. cache + run --------------------------------------------------------------
php artisan config:cache >/dev/null
php artisan route:cache >/dev/null

# Telemetry simulator: keep it alive for the life of the container.
( while true; do php artisan schedule:work || true; sleep 2; done ) &

log "listening on 0.0.0.0:$PORT (env=$APP_ENV, workers=$PHP_CLI_SERVER_WORKERS)"
exec php artisan serve --host=0.0.0.0 --port="$PORT" --no-reload
