#!/bin/sh
set -e

echo "Applying database migrations..."
node /app/scripts/migrate.mjs

echo "Starting Next.js server..."
# App Runner overrides HOSTNAME with the container's internal DNS name.
# Next.js reads HOSTNAME to set its bind address, so we must force 0.0.0.0
# to ensure the server is reachable by the platform health check.
export HOSTNAME="0.0.0.0"
exec node /app/server.js
