# Self-hosting — Cartwright as a Node container

Cartwright runs on Vercel by default ([`DEPLOY.md`](../DEPLOY.md)). It is also a plain Next.js
Node server: a [`Dockerfile`](../Dockerfile) and an opt-in **standalone** build run it anywhere,
and this page covers what works off Vercel today and what does not yet.

## Build the image

```bash
docker build -t my-shop --build-arg NEXT_PUBLIC_APP_URL=https://shop.example.com .
```

It builds with `pnpm install --frozen-lockfile` and `pnpm build`, then copies only
`.next/standalone`, `.next/static` and `public/` into a `node:22-bookworm-slim` image (the `.nvmrc`
major; `--build-arg NODE_VERSION=24` works too) that runs as the unprivileged `node` user.

- **`NEXT_PUBLIC_*` values are fixed at build time.** Next writes them into the bundle, so pass
  them as `--build-arg` (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID`), not at `docker run`. Changing one means rebuilding the image.
- **Secrets and local data never go into the image.** `.dockerignore` keeps them out at any
  depth: `.env*` (except `.env.example`), `.admin-credentials`, `*.pem`, `.vercel/`, SQLite
  databases and their `-wal`/`-shm`/`-journal` files (`prisma/dev.db`, `data/prod.db` …),
  `backups/`, `.mail-previews/` and `node_modules`. Runtime values go in at `docker run`.

`CARTWRIGHT_OUTPUT=standalone pnpm build` writes `.next/standalone/server.js`. Without the
variable `next.config.ts` has no `output` key, so a Vercel build is unchanged; any other value
stops the build with an error.

## Run it

```bash
docker run -d --name my-shop -p 3000:3000 --env-file .env.production my-shop
```

It serves plain HTTP on `0.0.0.0:$PORT` (default `3000`); put a TLS reverse proxy in front (Caddy,
nginx, Traefik, a load balancer). The image's `HEALTHCHECK` asks for `/robots.txt`.

| Variable | Needed for |
|---|---|
| `AUTH_SECRET` | Always — sessions and encrypted settings. `openssl rand -hex 32`. |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | The database (Turso). See the next section for a local SQLite file instead. |
| `CRON_SECRET` | The scheduled jobs. **Set it**: with it unset, the cron endpoints accept any caller (deprecated — a coming release refuses them in production). |
| `CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true` | Per-client rate limits — **only** behind a proxy that overwrites `X-Forwarded-For` ([`docs/mcp.md`](mcp.md)). Without it every anonymous visitor shares one bucket. |
| `RESEND_API_KEY`, `STRIPE_*`, `BLOB_READ_WRITE_TOKEN`, AI keys … | The features that use them, exactly as on Vercel — [`.env.example`](../.env.example). |

A `--profile site` scaffold has no database, admin or login and runs with no environment at all.

## The database

**Turso (recommended).** Set the two Turso variables. Push the schema from your own machine, as
on Vercel ([`DEPLOY.md`](../DEPLOY.md) §2 and §4) — the runtime image carries no Prisma CLI.

**A SQLite file on a volume.** One instance only, no horizontal scaling:

```bash
docker volume create shop-data
# One-off: create the schema and the first admin, from the build stage (it has the full toolchain).
docker build --target build -t my-shop-build .
docker run --rm -v shop-data:/data -e DATABASE_URL=file:/data/cartwright.db my-shop-build \
  sh -c 'pnpm db:setup && chown -R node:node /data'
# Then run the shop on the same volume.
docker run -d -p 3000:3000 -v shop-data:/data \
  -e DATABASE_URL=file:/data/cartwright.db -e ALLOW_SQLITE_IN_PRODUCTION=1 \
  --env-file .env.production my-shop
```

`pnpm db:setup` prints the admin login once; copy it from that output. Without
`ALLOW_SQLITE_IN_PRODUCTION=1` the shop refuses a file database in production, so a forgotten Turso
variable cannot quietly put real orders on a disk you did not mean to keep. Back up the volume.

## What still needs Vercel, or something like it

These use a Vercel service today; each is planned engine work (HOST2). Until it ships:

| Vercel piece | Off Vercel today | Planned |
|---|---|---|
| **Cron jobs.** Vercel calls the jobs listed under `crons` in [`vercel.json`](../vercel.json) — backup, Stripe reconciliation, token clean-up and seven more. | Nothing calls them in a container. Schedule each yourself on the same schedule as a `GET` with `Authorization: Bearer $CRON_SECRET`, e.g. a crontab line `0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://shop.example.com/api/cron/reconcile-stripe`. | HOST2-2: a cron runner that needs no Vercel. |
| **File storage.** Admin uploads, contact-form attachments, database backups, SitePack export, image tools, Drive import and the logo generator store files in **Vercel Blob**. | Vercel Blob is a public HTTPS API, so it works from any host: set `BLOB_READ_WRITE_TOKEN` from a Vercel Blob store. Without it those features cannot store files. | HOST2-3: a storage adapter with S3-compatible storage (R2, MinIO, Hetzner …) as the alternative. |

Email (Resend) is an HTTPS API that works from any host. Image optimisation runs in the container
(`sharp` is in the image) with its cache in `.next/cache`, rebuilt after a restart. Sentry works as
on Vercel; its `automaticVercelMonitors` cron check-ins only apply to Vercel cron.

## Without Docker

The same build runs on any Node 22 or 24 machine:

```bash
pnpm install --frozen-lockfile
CARTWRIGHT_OUTPUT=standalone pnpm build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3000 node --env-file=.env.production .next/standalone/server.js
```

Next copies your root `.env` and `.env.production` into `.next/standalone` after tracing; the
switch's build deletes every `.env*` file there as `next build` exits (your own `output:
"standalone"` config does not), so the server reads its variables from the environment you start
it in. Local databases, backups, mail previews and credentials are traced out, so point
`DATABASE_URL` at a file outside `.next/standalone` (or use Turso).

## What has been checked

- **Standalone build, locally** (Node 24): planted databases, backups, mail previews and
  credentials stayed out of `.next/standalone`; pages, assets and an `/api/inquiries` write answered
  200. With a root `.env` and `.env.production` planted it held no `.env*` file and no copy of their
  secret (with the delete step disabled, both were there); started with `--env-file`, it served 200.
- **The image, in Cartwright's own CI** when an image input changes: built, booted, pages and
  `HEALTHCHECK` checked, with the same files (root `.env` and `.env.production` included) planted
  first to prove neither stage carries them.
- **Not run end to end:** the SQLite-on-a-volume one-off and an image of a `--profile site` scaffold.
