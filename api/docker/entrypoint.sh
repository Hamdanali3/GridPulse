#!/usr/bin/env bash
# Waits for the database, migrates (and seeds demo data on first boot if SEED_DEMO=true),
# then runs the scheduler in the background and the HTTP server in the foreground.
set -euo pipefail
cd /app

php artisan config:clear >/dev/null
for i in $(seq 1 30); do
  if php artisan migrate:status >/dev/null 2>&1; then break; fi
  echo "[entrypoint] waiting for database ($i)"; sleep 2
done

php artisan migrate --force
if [ "${SEED_DEMO:-false}" = "true" ] && [ "$(php artisan tinker --execute='echo \App\Models\Site::count();' 2>/dev/null | tail -1)" = "0" ]; then
  echo "[entrypoint] seeding demo fleet"
  php artisan db:seed --force
fi

php artisan config:cache
php artisan route:cache

php artisan schedule:work &
exec php artisan serve --host=0.0.0.0 --port=8000
