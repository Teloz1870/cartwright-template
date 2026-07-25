# Deploy Guide

Cartwright forks typically deploy to **Vercel + Turso**. This guide covers the first deploy of a new fork.

> **Shortcut:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTeloz1870%2Fcartwright-template&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN,AUTH_SECRET&envDescription=Turso%20database%20URL%20%2B%20auth%20token%20and%20a%20random%20AUTH_SECRET%20(openssl%20rand%20-hex%2032).%20See%20DEPLOY.md%20for%20the%203-minute%20setup.&envLink=https%3A%2F%2Fgithub.com%2FTeloz1870%2Fcartwright-template%2Fblob%2Fmain%2FDEPLOY.md&project-name=my-cartwright-site&repository-name=my-cartwright-site)
> clones the template repo into your GitHub and deploys in one flow — you're prompted for the three
> env vars from steps 2-3 along the way. Then complete step 4 (migrate + seed) manually.

## 1. Vercel project

**Push to GitHub first, then connect Vercel to the repo.** Not the other way round —
`vercel link` links a *folder* to a project, which is not the same thing as connecting
the project to your repository, and the difference decides what "deploy" means for the
rest of this guide (see §9).

```bash
# From repo root. If you have no remote yet, create one — private:
gh repo create <your-shop> --private --source=. --remote=origin --push

vercel link                  # Select or create a Vercel project under your org
vercel git connect           # ← the step that makes pushes deploy. Needs a remote.
vercel env pull .env.vercel  # Inspect what Vercel has — see the two warnings below
```

> **Why `git connect` is not optional.** With it, every push builds a deployment
> tied to a commit, branches get preview URLs, and "roll back" means redeploying a
> known commit. Without it your only deploy path is `vercel --prod`, which uploads
> the folder — see §9 for what that costs you.
>
> Creating the project by importing the repo at **vercel.com/new** does all of this
> in one step, and is the path the "Deploy with Vercel" button above uses.

> **`env pull` OVERWRITES the target file — it does not merge.** Pulling into
> `.env.local` replaces whatever is there, so local-only keys (AI providers,
> Unsplash, a dev `AUTH_SECRET`) are gone with one command and no prompt. Pull
> into a scratch file like `.env.vercel` and copy across what you need.
>
> Note that `vercel integration add` (marketplace integrations) runs `env pull`
> as a **side effect** unless you pass `--no-env-pull` — same loss, without
> typing the command.

> **A pulled value that looks empty is not proof it is missing.** Vercel marks
> variables created via the CLI as sensitive and writes them back as **empty
> strings**, so `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` and friends can all
> read as `0 characters` on a site that is running perfectly. Verify from
> production instead: `/admin/integrations` decrypts with production's own
> `AUTH_SECRET` and reports each key as configured (with a masked excerpt) or as
> coming from the environment.

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
# From a local terminal, with .env pointed at Turso.
# NOTE: the Prisma CLI reads `.env`, NOT `.env.local` — so a file you pulled or
# edited at step 1 is not the one this step uses. Getting that backwards fails
# here, several steps after the mistake.
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
git push origin main         # builds the pushed commit — IF you ran `vercel git connect` (§1)
pnpm verify:deploy https://<your-shop>.vercel.app
```

> **`vercel --prod` is not the same thing, and the difference is not cosmetic.**
> It uploads your **working directory** — including changes you have not committed.
> That is a fine way to try something; it is a poor way to run production:
>
> - Uncommitted code can go live with no warning and no trace.
> - You cannot answer "which commit is running?" — a CLI deploy carries no commit.
> - You cannot roll back to a known state, only to an earlier upload.
> - Code that exists only in production and on one laptop is one disk failure from gone.
>
> If `git push` does not produce a deployment, the project is not connected to the
> repo. Fix that (§1) rather than reaching for `vercel --prod`.

**Then verify it, every time.** A deployment can report `● Ready` and serve nothing:
a project whose Framework Preset is `Other` — what an empty CLI-created project gets —
serves `public/` as a static site instead of building, so every route 404s while the
build log stays empty and nothing errors. `pnpm verify:deploy <url>` asks for three
routes the *app* generates (`/robots.txt`, `/sitemap.xml`, `/llms.txt`), which can only
answer 200 if the framework actually ran. This repo pins `"framework": "nextjs"` in
`vercel.json`, which overrides the project setting — keep that key.

## 10. Production checklist

- [ ] **The repo is on GitHub and Vercel is connected to it** (`vercel git connect`) — until then
      nothing is backed up, your CI never runs, and no deployment maps to a commit
- [ ] **`pnpm verify:deploy <url>` passes against the live URL** — a `● Ready` deploy that serves
      `public/` statically 404s every route without erroring; this is the one check that tells them apart
- [ ] **`vercel.json` still has `"framework": "nextjs"`** (it overrides the project's preset)
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
- [ ] **Content-Security-Policy is enforced.** `next.config.ts` ships
      `Content-Security-Policy-Report-Only`, which enforces **nothing** — it is a
      deliberate starting point (read the reports first, then tighten), but a site
      can go live believing it has a CSP. Switch the header name when you are ready.
- [ ] **A green `pnpm build` validates no environment at all.**
      `lib/env-preflight.ts` returns early during `NEXT_PHASE=phase-production-build`,
      by design — a build must not require database credentials. The first real
      check is the running server, so hit the deployed URL before calling it done.

> **`NEXT_PUBLIC_*` is inlined at build time.** Setting or changing one in Vercel
> *after* a deploy is a silent no-op until the next build. This applies to
> `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `NEXT_PUBLIC_SENTRY_DSN`
> and the rest — redeploy after changing any of them.
>
> Server-side keys behave the opposite way: set them in `/admin/integrations`
> instead and they take effect without a redeploy (AES-256-GCM encrypted in the
> database, rotatable live).

> **`ANTHROPIC_API_KEY` is optional, and stays optional.** Without it the AI
> assistant returns 503 and lead triage is skipped silently — nothing fails and
> nothing is logged. It is not required by `lib/env-preflight.ts` and does not
> belong on this checklist unless you have turned on an AI feature that needs it
> (`features.leadAiTriage`, the assistant, design/section generation).

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
