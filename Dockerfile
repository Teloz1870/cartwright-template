# syntax=docker/dockerfile:1
# Cartwright as a Node container on any host — guide: docs/self-hosting.md.
#   docker build -t my-shop . && docker run -p 3000:3000 --env-file .env.production my-shop
# One file for every scaffold profile: it builds through the project's own
# `pnpm install` + `pnpm build` and never runs Prisma itself (the database
# profiles generate the client inside `pnpm build`; `site` has no Prisma).

# The Node major .nvmrc names (a test keeps them equal); 24 works too.
ARG NODE_VERSION=22
ARG PNPM_VERSION=11.1.3

# ── build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG PNPM_VERSION
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# openssl: the database toolchain (and `pnpm db:setup` from this stage) needs it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

# The whole tree before the install: the database profiles' postinstall reads
# prisma/schema.prisma. .dockerignore keeps node_modules, .next, .env files and
# local databases out; the cache mount keeps the pnpm store between builds.
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# NEXT_PUBLIC_* values are written into the bundle: build arguments, not runtime env.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID
RUN CARTWRIGHT_OUTPUT=standalone pnpm build

# ── run ──────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# A home for a SQLite file on a mounted volume (DATABASE_URL=file:/data/…).
RUN mkdir -p /data && chown node:node /data /app

# server.js serves public/ and .next/static only when they sit next to it.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

# robots.txt is server-rendered in every profile: a 200 means Node is answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
