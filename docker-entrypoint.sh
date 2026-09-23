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

exec "$@"
