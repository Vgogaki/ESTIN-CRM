FROM node:22-bookworm-slim AS deps
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `prisma generate` only reads the schema — it never connects — but
# prisma.config.ts requires DATABASE_URL to be resolvable just to load. The
# real value is supplied at container runtime, not at build time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js standalone output — a self-contained server with only the
# dependencies actually used by the app (see next.config.ts).
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

# The standalone bundle only includes what the app itself imports at
# runtime — not the Prisma CLI, which the entrypoint needs to run
# migrations. Rather than cherry-pick its (many, transitive) dependencies
# one at a time, layer the full node_modules on top; same install, so
# nothing conflicts with what standalone already traced in.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules

# The seed scripts (prisma/seed*.ts) import the app's own server code and
# resolve its "@/..." paths, so they need the source and tsconfig at runtime.
# Only used when RUN_SEED / ALLOW_DEMO_SEED are switched on (docker-entrypoint.sh).
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown nextjs:nextjs docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
