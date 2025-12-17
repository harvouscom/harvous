#!/bin/sh
# Docker entrypoint script for Harvous

set -e

echo "Starting Harvous self-hosted..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -U harvous -d harvous; do
  sleep 1
done

echo "PostgreSQL is ready!"

# Initialize database if needed
if [ "$INIT_DB" = "true" ]; then
  echo "Initializing database..."
  npm run db:init-postgres
fi

# Start the application
exec "$@"

