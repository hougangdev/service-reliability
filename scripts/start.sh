#!/bin/sh
set -e

echo "Applying database migrations..."
node /app/scripts/migrate.mjs

echo "Starting Next.js server..."
exec node /app/server.js
