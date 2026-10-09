#!/bin/sh
set -e

# Called via its real entry point, not the node_modules/.bin/prisma shim —
# that shim is a symlink in the build stage, and cross-stage COPY flattens
# it into a broken relative require. See docs/deployment.md.
#
# Safe to run on every container start, including with multiple replicas —
# Prisma takes an advisory lock so concurrent `migrate deploy` runs don't
# race each other.
node node_modules/prisma/build/index.js migrate deploy

# Optional, switched on only by the host's settings (docs/hosting-review.md).
# Both are idempotent and safe on every start:
#  - RUN_SEED=on        roles + the founder/co-founder admin accounts (passwords from
#                       SEED_FOUNDER_PASSWORD / SEED_COFOUNDER_PASSWORD, never logged)
#  - ALLOW_DEMO_SEED=yes  obviously-fake demo data; refuses to run if any real
#                       (non-demo) person exists in the database
if [ "$RUN_SEED" = "on" ]; then
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts
fi
if [ "$ALLOW_DEMO_SEED" = "yes" ]; then
  node node_modules/tsx/dist/cli.mjs prisma/seed-demo.ts
fi

exec "$@"
