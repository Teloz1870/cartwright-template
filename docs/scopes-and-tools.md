# Scopes & the tool surface

Cartwright is **AI-first**: every operation a human admin can perform is also a
named, scoped *tool* that an API key, an MCP client, or a chat session can call.
This document is the scope model and the per-tool authorization map.

Source of truth: [`lib/scopes.ts`](../lib/scopes.ts),
[`lib/tools/registry.ts`](../lib/tools/registry.ts), and the live, always-current
catalog at **`GET /api/v1/tools`** (see [the canonical catalog](#the-canonical-catalog)).

---

## The model

- Each tool is tagged with **exactly one** required `scope`, written
  `<domain>:<action>` (e.g. `products:write`, `orders:read`).
- An API key (or session) carries a **list** of granted scopes and may call any
  tool whose required scope is in that list.
- `hasScope(granted, required)` is the check. It also accepts a wildcard
  `"<domain>:*"` (reserved for root keys in the admin UI; **never** issued to
  session JWTs).

### The 21 scopes

```
products:read    products:write
categories:read  categories:write
pages:read       pages:write
discounts:read   discounts:write
orders:read      orders:write
settings:read    settings:write
features:read    features:write
audit:read       audit:revert
analytics:read   marketing:write
catalog:read     cart:write       customer:read
```

Presented in `/admin/api-keys` as checkbox groups (`SCOPE_GROUPS`): **Katalog**,
**Indhold**, **Salg**, **Drift**, **Kunde**.

### Session scope sets — the privilege boundary

Two constants in `lib/scopes.ts` define what non-key callers may do. Changing
either is a **security-sensitive** edit (re-run the pen-test):

- **`CUSTOMER_CHAT_SCOPES`** — storefront chat / voice session JWTs get only
  `catalog:read`, `cart:write`, `customer:read`, `orders:write`. A jailbroken
  storefront assistant therefore **cannot** reach admin CRUD — it has no
  `products:write`, `settings:write`, etc. to escalate into.
- **`ADMIN_CHAT_SCOPES`** — the operator chat (`/admin/ai`) gets the admin
  scopes but **explicitly not `cart:write`** (admins manage orders, not carts).

## Enforcement — one chokepoint

**`invokeTool(name, args, ctx, granted)`** in
[`lib/tools/registry.ts`](../lib/tools/registry.ts) is the *only* code path that
runs a tool, and it is where the scope check lives. Every surface routes through
it:

| Surface | `granted` scopes come from |
|---|---|
| REST `/api/v1/tools/<name>` | the five public reads use the fixed anonymous public scope set; every other call uses the verified API key |
| MCP `/api/mcp` | the same fixed public set without a key, or the verified key's scopes (see [mcp.md](mcp.md)) |
| Storefront chat / voice | `CUSTOMER_CHAT_SCOPES` |
| Admin chat | `ADMIN_CHAT_SCOPES` |

`invokeTool` returns structured results: `403` (scope missing), `404` (unknown
tool), `422` (Zod validation failed, with issues), `500` (handler threw). If a
caller bypasses `invokeTool`, no tool runs — so there is a single place to audit.

### Destructive operations need `confirm: true`

Beyond scopes, mutating/destructive tools (`*.delete`, `audit.revert`, and the
genome/design/branding writers) require an explicit `confirm: true` in their
arguments — a plan-first gate so an AI cannot destroy data on a hallucinated
call. Scope alone is **not** sufficient for these even when the caller is an
authenticated admin.

### Revertible operations

Tools that capture a before-snapshot can be rolled back via `audit.revert`
(scope `audit:revert`). The revertible set today:

```
design.set_layout   design.import_from_url
features.set         products.delete         three.configure
genome.set           genome.resolve          genome.set_identity
genome.reharmonize   genome.describe_business
```

## The tool map (88 tools across 36 domains)

Grouped by name **domain** (the prefix before the dot). ★ = revertible. This
table is REGENERATED from the registry — `tests/unit/docs-tool-counts.test.ts`
fails the suite if the headline numbers above drift from
`lib/tools/registry.ts`, and the [canonical catalog](#the-canonical-catalog)
is always the runtime authority.

| Domain | Tools | Scopes |
|---|---|---|
| address | `address.autocomplete` | `catalog:read` |
| analytics | `analytics.summary` | `analytics:read` |
| audit | `audit.list`, `audit.revert` | `audit:read` · `audit:revert` |
| cart | `cart.add`, `cart.update_quantity`, `cart.remove`, `cart.get_summary` | `cart:write` |
| categories | `categories.list`, `categories.upsert`, `categories.delete` | `categories:read` · `categories:write` |
| chrome | `chrome.set`★ | `settings:write` |
| composition | `composition.apply`★, `composition.export` | `settings:write` · `settings:read` |
| content | `content.import_site` | `settings:write` |
| customer | `customer.lookup_by_email`, `customer.lookup_by_phone` | `customer:read` |
| design | `design.import_from_url`★, `design.get_layout`, `design.set_layout`★, `design.set_slug`★ | `settings:write` · `settings:read` |
| discounts | `discounts.list`, `discounts.create`, `discounts.toggle`, `discounts.try_apply` | `discounts:read` · `discounts:write` · `cart:write` |
| docs | `docs.import` | `pages:write` |
| drive | `drive.import_folder`, `drive.backup_now` | `settings:write` |
| features | `features.get`, `features.set`★ | `features:read` · `features:write` |
| gdpr | `gdpr.export_user`, `gdpr.erase_user` | `customer:read` · `settings:write` |
| genome | `genome.get`, `genome.set`★, `genome.resolve`★, `genome.set_identity`★, `genome.reharmonize`★, `genome.describe_business`★, `genome.set_entity_copy`★ | `settings:read` · `settings:write` |
| google | `google.connect_status` | `settings:read` |
| images | `images.search_unsplash`, `images.import_from_url` | `catalog:read` · `settings:write` |
| magic | `magic.plan_page`, `magic.generate_page`, `magic.compose_look`★ | `pages:read` · `settings:write` |
| marketing | `marketing.create_campaign` | `marketing:write` |
| mockup | `mockup.set`, `mockup.clear` | `settings:write` |
| orders | `orders.list`, `orders.get`, `orders.update_status`, `orders.create` | `orders:read` · `orders:write` |
| pages | `pages.list`, `pages.upsert`, `pages.delete`, `pages.get_layout`, `pages.set_layout`★ | `pages:read` · `pages:write` |
| posts | `posts.list`, `posts.create`, `posts.update`, `posts.publish` | `pages:read` · `pages:write` |
| products | `products.search`, `products.get`, `products.create`, `products.update`, `products.delete`★, `products.attach_image` | `catalog:read` · `products:write` |
| scraper | `scraper.scrape_url` | `products:write` |
| services | `services.create`, `services.update` | `pages:write` |
| settings | `settings.get`, `settings.update_shipping`, `settings.update_branding`, `settings.update_copy` | `settings:read` · `settings:write` |
| site | `site.list_pages`, `site.get_page` | `pages:read` (anonymous public-content projection) |
| sheets | `sheets.sync_now`, `sheets.pull`, `sheets.push` | `products:write` |
| sitepack | `sitepack.export`, `sitepack.import` | `settings:read` · `settings:write` |
| subscriptions | `subscriptions.list`, `subscriptions.cancel` | `orders:read` · `orders:write` |
| three | `three.get`, `three.configure`★ | `settings:read` · `settings:write` |
| ui | `ui.present_products` | `catalog:read` |
| user | `user.get_last_shipping` | `customer:read` |
| vertical | `vertical.apply`★ | `settings:write` |

> Note the deliberate choices: `products.get`/`products.search` use the
> customer-safe `catalog:read` (not `products:read`), so storefront chat can
> browse but not enumerate admin product internals; `gdpr.erase_user` requires
> `settings:write` (destructive, admin-level) while `gdpr.export_user` only needs
> `customer:read`; `scraper.scrape_url` writes products so it carries
> `products:write`.

## The canonical catalog

`GET /api/v1/tools` ([`app/api/v1/tools/route.ts`](../app/api/v1/tools/route.ts))
is **public and unauthenticated** by design — it is the curated, machine-readable
description of *what the shop can do*, used by MCP clients at discovery and by
developers/journalists. It returns each tool's `name`, `description`, `scope` and
`revertible` flag — and with `?schema=true`, the full input **JSON Schema**
(converted from the tool's Zod schema by `buildToolManifest()`).

It exposes the **tool contract**, never the database schema, never handler
source, never data. Filter with `?scope=<scope>` to see only the tools a given
scope covers. `products.search`, `products.get`, `categories.list`,
`site.list_pages` and `site.get_page` can be called anonymously through their
strict public projections and shared rate limit. Every private read and every
write requires a Bearer key with the right scope via
`POST /api/v1/tools/<name>`.

Because this catalog is generated from the registry, treat it — not this
document — as the authority when they disagree, and regenerate the table above
if you are auditing.
