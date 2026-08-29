# The simple site — Cartwright without a database

Use the shipped `site` profile when you want pages, a contact form and strong discovery without
carrying the webshop, database, admin or authenticated agent runtime.

## Quick start

```bash
npx create-cartwright@latest my-site --profile site
cd my-site
pnpm dev
pnpm build
```

The scaffold is materialised from `scaffold/manifest.json`, not hidden behind runtime flags. It
contains the static design/page layer plus the default `contact-form` module and deliberately
omits Prisma, the database, admin, auth, commerce, MCP execution and private tool APIs.

## Optional modules

The CLI accepts repeatable `--with` flags for modules that the selected profile supports. The
template's generated manifest is the source of truth; ask the CLI for the current list:

```bash
npx create-cartwright@latest --help
```

Discovery in a `site` scaffold is capability-aware: it advertises the static public resources that
actually exist and does not claim MCP, REST operations, checkout or other removed interfaces.

## When to choose `light` instead

Choose the default `light` profile if the site needs editable CMS pages, the admin panel, a local or
hosted database, API keys, or the public read-only agent surface:

```bash
npx create-cartwright@latest my-managed-site
```

`light` starts in website mode and retains the mode-gated webshop foundation. Add
`--template generic` when it should start as a shop. Heavy full-only modules and non-curated design
packs are pruned; they are available with `--profile full`.

## What `site` intentionally does not provide

- No database, Prisma schema, seed or admin login.
- No `/admin`, customer accounts, cart, checkout or order storage.
- No executable MCP server, authenticated REST tool registry or operational AI actions.
- No runtime CMS editing; content lives in the generated source files.

These are profile boundaries, not temporarily disabled features. If a requirement crosses one of
them, scaffold `light` or `full` instead of reassembling the removed runtime by hand.

## See also

- [`docs/getting-started.md`](getting-started.md) — the general first-run guide
- [`docs/scopes-and-tools.md`](scopes-and-tools.md) — the governed agent surface in database-backed profiles
- [`docs/versioning-policy.md`](versioning-policy.md) — stable tags, `main`, and deliberate updates
