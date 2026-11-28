# Getting started — your first login

This walks you from a fresh scaffold to logged in as admin, and explains the one thing people
get stuck on: **where your admin password comes from** (hint: not email).

## 1. Scaffold + install

```bash
npx create-cartwright@latest my-store
cd my-store
pnpm dev                       # http://localhost:3000
```

The CLI installs dependencies and writes `.env.local`. For the database-backed `light` and
`full` profiles it also creates the selected database schema, seeds it, and prints the admin
credentials. The default `light` profile starts in website mode; add `--template generic` for
a webshop or `--profile site` for a no-database static site. For production use Turso
(`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) — see
[`../DEPLOY.md`](../DEPLOY.md).

Before customising, verify the production compiler in a second terminal:

```bash
pnpm build
```

Manual clone or `--no-install`? Run `pnpm install`, copy `.env.example` to `.env.local`, set
`AUTH_SECRET` and `DATABASE_URL="file:./dev.db"`, then continue with step 2.

## 2. Create the schema + seed

The normal CLI path already completed this step. For a manual clone or `--no-install`, run:

```bash
pnpm db:setup                  # create the tables + seed the admin & demo data (one robust step)
```

> If `prisma db push` shows a blank **`Schema engine error:`**, that's an intermittent Prisma 7.8
> first-run crash (seen on macOS arm64 + Node 24) — `db:setup` handles it automatically by applying the
> schema via the libSQL client, bypassing the flaky schema engine. If it reports the engine can't start
> at all, switch to a tested LTS: `nvm use 22 && pnpm db:setup`.

The seed creates **one admin user** and sets its password. There is **no hardcoded default**
(no `admin1234`). One of two things happens:

- **You set `ADMIN_PASSWORD`** in `.env` → that becomes the admin password. The seed prints only
  a confirmation; nothing is written to disk.
- **You didn't** → the seed generates a strong random password and shows it to you **once**, in a
  boxed banner:

  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  ADMIN-LOGIN (vises kun denne ene gang — gem det nu)         │
  ├─────────────────────────────────────────────────────────────┤
  │  Email:    admin@your-domain.com                            │
  │  Password: 8Kf2…                                            │
  └─────────────────────────────────────────────────────────────┘
  ```

  The same email + password are also written to **`.admin-credentials`** in your project root, so
  you don't lose it if the terminal scrolls away. That file is **gitignored** (never committed,
  never shared, never reaches the public template mirror). **Delete it** once you've saved the
  password somewhere safe.

> Lost it anyway? Run **`pnpm admin:reset`** — it resets only the admin password and keeps all your
> data. `npx prisma db seed` would also give you a fresh admin, but it wipes the database first and
> therefore refuses once there is anything to lose (any product, page, category, order, or a second
> account); re-run it with `ALLOW_DESTRUCTIVE_SEED=1` if wiping is what you actually want.

## 3. First login

Go to **`/account/login`**, stay on the **Password** tab (the default), and enter the admin
email + password from step 2. You'll be sent straight to **`/admin/konto`** and required to set
your own password before anything else — the generated one is single-use.

> **You do not need email set up to log in.** Login is password-based by default. This is deliberate:
> a brand-new shop can't email you your password before email is configured.

## 4. Email is a separate, optional step

Until you configure email, anything that *sends* mail — **password reset**, **magic-link login**,
order confirmations — won't actually deliver. Instead those mails are written to a local
`.mail-previews/` folder so you can inspect them in dev. The login screen hides "forgot password"
while email is off, so it isn't a dead end.

To turn on real email:

1. Create a [Resend](https://resend.com) account and **verify your sending domain**.
2. In the admin panel → **Integrations** (`/admin/integrations`), paste your **Resend API key** and
   set your **from-address** (must be on the verified domain, e.g. `noreply@your-domain.com`).
3. The status badge flips from amber *“preview-mode”* to green *“real emails sent”*. Magic-link and
   password-reset now work.

The first run also offers a **setup wizard** (`/admin/setup`) that walks brand identity → theme → AI
key → email/sender → first category. You can skip it and configure things from the admin panel later.

## Summary

| Question | Answer |
|---|---|
| Where's my admin password? | Seed terminal output **and** `.admin-credentials` (delete after saving). Or set `ADMIN_PASSWORD`. |
| Do I need email to log in? | No — login is password-based. |
| Why didn't my password-reset email arrive? | Email (Resend) isn't set up yet; the mail went to `.mail-previews/`. Configure Resend in `/admin/integrations`. |
| Do I enter a different email address? | Your admin/login email and your sending from-address are set in the setup wizard or `/admin/integrations`. |
