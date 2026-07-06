# Deploy Guide

Cartwright forks typically deploy to **Vercel + Turso**. This guide covers the first deploy of a new fork.

> **Shortcut:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTeloz1870%2Fcartwright-template&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN,AUTH_SECRET&envDescription=Turso%20database%20URL%20%2B%20auth%20token%20and%20a%20random%20AUTH_SECRET%20(openssl%20rand%20-hex%2032).%20See%20DEPLOY.md%20for%20the%203-minute%20setup.&envLink=https%3A%2F%2Fgithub.com%2FTeloz1870%2Fcartwright-template%2Fblob%2Fmain%2FDEPLOY.md&project-name=my-cartwright-site&repository-name=my-cartwright-site)
> clones the template repo into your GitHub and deploys in one flow — you're prompted for the three
> env vars from steps 2-3 along the way. Then complete step 4 (migrate + seed) manually.

## 1. Vercel project

```bash
# From repo root, after git clone:
vercel link              # Select or create a Vercel project under your org
vercel env pull .env.local  # Pulls existing env vars (empty on a fresh fork)
```

## 2. Turso database

```bash
# Once per fork:
turso db create <your-shop>-db
turso db tokens create <your-shop>-db

# Add to Vercel project env (Production):
#   TURSO_DATABASE_URL=libsql://<your-shop>-db.turso.io
#   TURSO_AUTH_TOKEN=<token from above>
```

> **Required:** Without `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` the app refuses to
> start in production (`lib/db.ts` guard) — rather than silently falling back
> to an ephemeral local SQLite file that loses data on every deploy. If you're
> deliberately self-hosting on a persistent volume, you can set
> `ALLOW_SQLITE_IN_PRODUCTION=1` together with `DATABASE_URL=file:./data/prod.db`.

## 3. Auth secret

```bash
# Generate + set in Vercel env (Production + Preview):
openssl rand -hex 32
#   AUTH_SECRET=<output>
```

## 4. Migrate + seed DB

```bash
# From a local terminal, with .env pointed at Turso (Prisma CLI reads .env, not .env.local):
npm run db:deploy   # = prisma migrate deploy
npx prisma db seed
```

> **Warning:** `prisma db seed` clears all tables before inserting. Run ONLY on a fresh DB. A production guard in `prisma/seed.ts:48-58` can be added if you want to protect against re-runs.

## 5. Stripe (when ready for real payments)

1. Create a Stripe test account: https://dashboard.stripe.com/register
2. Get test keys from https://dashboard.stripe.com/test/apikeys
3. Create a webhook endpoint:
   ```
   stripe webhook_endpoints create \
     --url=https://<your-shop>.vercel.app/api/webhook/stripe \
     --enabled-events=payment_intent.succeeded \
     --enabled-events=payment_intent.payment_failed \
     --enabled-events=payment_intent.canceled \
     --enabled-events=charge.refunded \
     --enabled-events=charge.dispute.created
   ```
4. Set the keys either:
   - In Vercel project env (Production): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, etc.
   - **Or** (recommended): use the `/admin/integrations` admin UI instead (DB-encrypted via AES-256-GCM, no redeploy on key rotation)

## 6. Sentry (optional)

```bash
# Once per fork:
# 1. Create a project on https://sentry.io (Next.js platform)
# 2. Add to Vercel project env:
#    NEXT_PUBLIC_SENTRY_DSN=https://...
#    SENTRY_DSN=https://... (same value)
#    SENTRY_ORG=<your-org>
#    SENTRY_PROJECT=<your-project>
#    SENTRY_AUTH_TOKEN=<token with project:releases+org:read scopes>
```

## 7. Resend (email — optional)

1. Create an account: https://resend.com
2. Verify your domain (DNS records, ~24 hours)
3. Get the API key from the dashboard
4. Set via `/admin/integrations` (DB-encrypted)

## 8. Vercel Blob (admin image upload)

```bash
# Vercel injects this automatically when you create a Blob store in the project:
#   BLOB_READ_WRITE_TOKEN
# Go to Vercel project → Storage → Create Database → Blob
```

## 9. Deploy

```bash
git push origin main
# Vercel auto-deploys from main. Or manually:
vercel --prod
```

## 10. Production checklist

- [ ] **`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`** set in Vercel Production (NOT a `file:` `DATABASE_URL` — the app refuses to start otherwise)
- [ ] `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` set in Vercel Production
- [ ] Migrations run against Turso (`npm run db:deploy`)
- [ ] Seed run (or products created manually via admin)
- [ ] Stripe **LIVE** keys (`sk_live_…`, not test) before real payments — in env or `/admin/integrations`
- [ ] Stripe webhook endpoint created + secret in env or `/admin/integrations`
- [ ] **Resend API key set** + domain verified (otherwise NO order confirmations are sent in prod)
- [ ] Sentry project linked (optional)
- [ ] First admin user created — the seed uses `ADMIN_PASSWORD` if set, otherwise a strong password is generated that is shown ONCE in the seed output (box: `ADMIN-LOGIN …`) **and** written to `.admin-credentials` in the repo root (gitignored + mirror-excluded — delete the file once you've saved the password). A generated password ⇒ the admin is forced to change it on first login via `/admin/konto`. No hardcoded default. See [`docs/getting-started.md`](docs/getting-started.md).
- [ ] `/api/cron/reconcile-stripe` has a `CRON_SECRET` if you use Vercel Cron

## Sync with cartwright upstream

Cartwright forks have their own Git tree. To get new platform features from cartwright:

```bash
git remote add cartwright https://github.com/<your-org>/cartwright.git
git fetch cartwright
git cherry-pick <commit-sha>
# Or merge a specific feature branch:
git merge cartwright/feature/<branch>
```

Sync migrations manually — cartwright may have migrations your fork already has, or vice versa. Use `npx prisma migrate status` to see which are missing.
