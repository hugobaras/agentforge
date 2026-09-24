#!/bin/sh
set -eu
cd /app/api
export PATH="/app/node_modules/.bin:/app/api/node_modules/.bin:${PATH}"
prisma migrate deploy
prisma db seed
if [ -f dist/main.js ]; then
  exec node dist/main.js
fi
exec node dist/src/main.js
