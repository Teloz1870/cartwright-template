# From a dev database to a production one

Everything about running Cartwright locally assumes the database is disposable.
`pnpm db:setup` creates a schema and fills it; `prisma db seed` clears ten tables
and starts over. That is the right shape for a database you can throw away.

Production is the opposite assumption, and the commands do not change when the
database does. This page is the difference.

## The one command that is not a production command

`prisma db seed` **deletes** before it inserts — every order, cart, product,
page, category, discount code and user account. `DEPLOY.md §4` lists it as a
first-deploy step, and on a genuinely fresh database it is exactly right.

Since v0.42.x it **refuses** rather than deleting whenever the database already
holds someone's work: any order, any content, more than the single admin the
seed itself creates, or a lone account that is not that admin. See
[`lib/seed-guard.ts`](../lib/seed-guard.ts) for the rule.

The consequence is deliberate: **after any successful seed, seeding again is a
decision, not a default.** If you mean it, `ALLOW_DESTRUCTIVE_SEED=1` says so out
loud. There is no accidental spelling of it.

## Getting a first admin on a database you cannot seed

This is the gap the guard opens, and it has its own command:

```bash
pnpm admin:create                        # first admin, at brand.emails.admin
ADMIN_EMAIL=you@yourshop.dk pnpm admin:create   # a different address
ADMIN_PASSWORD=… pnpm admin:create              # your own password, nothing written to disk
```

One INSERT. It touches nothing else, and it refuses rather than guessing:

| Situation | What it does |
|---|---|
| No admin exists | Creates one. A generated password is shown once, written to `.admin-credentials`, and must be changed at first login. |
| An admin already exists | Refuses, and names `pnpm admin:reset`. Creating a second admin would either duplicate the account or silently reset a password nobody asked about. |
| That email exists as a customer | Refuses. A customer account quietly becoming an admin is not a script's decision. |

## Which command do I want?

| I want to… | Command | Destroys anything? |
|---|---|---|
| Set up a brand-new local database | `pnpm db:setup` | No — it skips a database that already has users |
| Add the first admin to an existing database | `pnpm admin:create` | No |
| Get back into an account I am locked out of | `pnpm admin:reset` | No — password only |
| Reset a scratch database to template content | `ALLOW_DESTRUCTIVE_SEED=1 pnpm seed` | **Yes. Everything.** |

**Never change a password with raw SQL.** `UPDATE User SET passwordHash = …`
leaves `.admin-credentials` pointing at the old password, and a working login
then looks broken. `admin:reset` updates both, which is the entire reason it
exists.

## Before you run anything destructive, check which database you are on

The Prisma CLI loads `.env` **first** and then `.env.local` **with
`override: true`** ([`prisma.config.ts`](../prisma.config.ts)). So `.env.local`
wins wherever both set the same variable, and a reassuring `.env` tells you
nothing about where a command will actually land.

```bash
# What the CLI will really use:
grep -H 'DATABASE_URL\|TURSO_DATABASE_URL' .env .env.local 2>/dev/null
```

`vercel env pull` makes this worse in two documented ways — it **overwrites** the
target file rather than merging, and it returns sensitive values as **empty
strings**, so "empty" is not evidence that a variable is unset. `DEPLOY.md §1`
has the details.

## The first deploy, in order

1. **Schema** — `npm run db:deploy` (`prisma migrate deploy`) against the
   production database. Additive; it does not delete.
2. **Admin** — `pnpm admin:create`. On a truly empty production database
   `npx prisma db seed` also works and adds the template catalogue; on anything
   else it will refuse, which is the point.
3. **Verify the deploy actually serves the app** — `pnpm verify:deploy <url>`.
   A deployment can report success and serve your `public/` folder statically,
   in which case every route 404s while nothing errors.
4. **Sign in** at `/account/login` → Password tab, then change the password when
   prompted.

## Going the other way: a copy of production to develop against

There is no supported "pull production down" command, deliberately — a copy of a
live database on a laptop is a data-protection problem, not a convenience. If
you need realistic content locally, use
[`/admin/sitepacks`](../app/admin/sitepacks) to export a **SitePack**: it carries
content and design and deliberately leaves users, orders and secrets behind.
