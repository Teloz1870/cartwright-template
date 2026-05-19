# Deploy Guide

Cartwright-forks deploy'es typisk til **Vercel + Turso**. Denne guide dækker first-deploy af en ny fork.

## 1. Vercel-projekt

```bash
# Fra repo-root, efter git clone:
vercel link              # Vælg eller opret Vercel-projekt under din org
vercel env pull .env.local  # Trækker eksisterende env-vars (tom på fresh fork)
```

## 2. Turso-database

```bash
# Engang per fork:
turso db create <din-shop>-db
turso db tokens create <din-shop>-db

# Tilføj til Vercel project env (Production):
#   TURSO_DATABASE_URL=libsql://<din-shop>-db.turso.io
#   TURSO_AUTH_TOKEN=<token fra ovenstående>
```

## 3. Auth secret

```bash
# Generér + sæt i Vercel env (Production + Preview):
openssl rand -hex 32
#   AUTH_SECRET=<output>
```

## 4. Migrér + seed DB

```bash
# Fra lokal terminal, med .env.local peget på Turso:
npx prisma migrate deploy
npx prisma db seed
```

> **Advarsel:** `prisma db seed` rydder alle tabeller før insert. Kør KUN på fresh DB. Production-guard i `prisma/seed.ts:48-58` kan tilføjes hvis du vil beskytte mod genkørsel.

## 5. Stripe (når klar til real betalinger)

1. Lav Stripe-test-konto: https://dashboard.stripe.com/register
2. Hent test-keys fra https://dashboard.stripe.com/test/apikeys
3. Opret webhook-endpoint:
   ```
   stripe webhook_endpoints create \
     --url=https://<din-shop>.vercel.app/api/webhook/stripe \
     --enabled-events=payment_intent.succeeded \
     --enabled-events=payment_intent.payment_failed \
     --enabled-events=payment_intent.canceled \
     --enabled-events=charge.refunded \
     --enabled-events=charge.dispute.created
   ```
4. Sæt nøgler enten:
   - I Vercel project env (Production): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN` osv.
   - **Eller** (anbefalet): brug `/admin/integrations` admin-UI i stedet (DB-encrypted via AES-256-GCM, ingen redeploy ved key-rotation)

## 6. Sentry (valgfrit)

```bash
# Engang per fork:
# 1. Lav projekt på https://sentry.io (Next.js-platform)
# 2. Tilføj til Vercel project env:
#    NEXT_PUBLIC_SENTRY_DSN=https://...
#    SENTRY_DSN=https://... (samme værdi)
#    SENTRY_ORG=<din-org>
#    SENTRY_PROJECT=<dit-projekt>
#    SENTRY_AUTH_TOKEN=<token med project:releases+org:read scopes>
```

## 7. Resend (email — valgfrit)

1. Lav konto: https://resend.com
2. Verifér dit domæne (DNS-records, ~24 timer)
3. Hent API-key fra dashboard
4. Sæt via `/admin/integrations` (DB-encrypted)

## 8. Vercel Blob (admin image-upload)

```bash
# Vercel injecter automatisk når du opretter en Blob-store i projektet:
#   BLOB_READ_WRITE_TOKEN
# Gå til Vercel project → Storage → Create Database → Blob
```

## 9. Deploy

```bash
git push origin main
# Vercel auto-deployer fra main. Eller manuelt:
vercel --prod
```

## 10. Production checklist

- [ ] `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` sat i Vercel Production
- [ ] Migrations kørt mod Turso (`prisma migrate deploy`)
- [ ] Seed kørt (eller produkter oprettet manuelt via admin)
- [ ] Stripe webhook-endpoint oprettet + secret i env eller `/admin/integrations`
- [ ] Resend domain verified
- [ ] Sentry-projekt linked (valgfri)
- [ ] First admin-user oprettet (default seed: `admin@example.com` / `admin1234` — skift password!)
- [ ] `/api/cron/reconcile-stripe` har `CRON_SECRET` hvis du bruger Vercel Cron

## Sync med cartwright upstream

Cartwright-forks har deres egen Git-tree. For at få nye platform-features fra cartwright:

```bash
git remote add cartwright https://github.com/<din-org>/cartwright.git
git fetch cartwright
git cherry-pick <commit-sha>
# Eller merge en specifik feature-branch:
git merge cartwright/feature/<branch>
```

Migrations sync manuelt — cartwright kan have migrations din fork allerede har, eller omvendt. Brug `npx prisma migrate status` til at se hvilke der mangler.
