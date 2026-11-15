# Domain model

What Cartwright stores, which code should write it, and where a shop meets the systems around it.
Read this before you add a table, a column or a new write path: most of what a shop needs already
has a home.

- An **aggregate** is a group of tables that belong to one part of the business.
- A **write door** is the code that should do the writing, so that validation, audit and side
  effects happen once.
- A **port** is where the engine talks to a system it does not own.

**(planned)** marks what is not built yet. **(old)** marks a table with no code behind it: ignore
it, and never drop it. Everything unmarked is in the code today. A scaffold can lack the code behind
some of these tables, because a profile leaves modules out.

| Aggregate | Write door |
|---|---|
| [Catalogue](#catalogue) | `lib/catalog/products.ts` (planned) |
| [Sales](#sales): Lead → Quote → Order | `lib/orders/lifecycle.ts` and `lib/orders/on-paid.ts` |
| [Money](#money) | `lib/pricing.ts` and `lib/shipping/resolve.ts` (planned) |
| [Customer](#customer) | No single door |
| [Content](#content) | The tools in `lib/tools/` |
| [Settings](#settings) | No single door |
| [Agent/audit](#agentaudit) | `lib/audit.ts` and `lib/tools/registry.ts` |

## Before you add anything

1. **Find the home.** A form of any kind goes in `Lead`: its `source` and `data` fields take what a
   custom form collects. A product field goes in `Product.attributes`, never in the legacy eyewear
   columns `frameColor`, `lensColor` or `brand`.
2. **Write through the door.** Where the door is still planned, call the tool in `lib/tools/`: it
   checks the scope, validates the input and writes an audit entry. Some server actions under
   `app/admin/` write through Prisma directly, with no audit. Do not copy them.
3. **Add, never rename or drop.** New columns are nullable or have a default. `*Dkk` columns keep
   their name, and hold minor units of the shop's base currency, whatever that currency is.

## Catalogue

What the shop sells and how it is found.

**Write door:** `lib/catalog/products.ts` (planned). It is not built yet. Today `lib/tools/products.ts`
is the path with validation and audit. Admin actions (`app/admin/actions.ts`), imports
(`lib/products-csv.ts`, `lib/tools/sitepack.ts`) and stock moves (`lib/orders/restock.ts`) write
`Product` themselves. The `products.*` tools do not touch variants: `app/admin/produkter/variants.ts`
does.

| Model | Holds |
|---|---|
| `Category` | The category tree, with SEO fields and an optional `permalink` |
| `Product` | Name, price, stock, images, `attributes`, and its primary category |
| `ProductVariant` | One sellable variant: its own SKU, price and stock |
| `ProductCategory` | Extra categories for a product. The primary one, in `Product.categoryId`, alone decides its URL |
| `MediaAsset` | One stored file, found again by its `sha256`, with alt text |
| `ProductMedia` | A product's ordered gallery |
| `MediaAlias` | One row per old image address, pointing at its asset, so old image URLs keep working |
| `ProductReview` | A review, with its moderation status |
| `ReviewPromptLog` | One row per order whose review request went out, so it goes once |
| `ProductEmbedding` | A product's vector for semantic search |
| `ImageSearchCache` | Cached image-search results |
| `Supplier` | A dropship supplier a product can point at |

## Sales

Lead → Quote → Order: someone asks, the shop offers, the customer buys.

**Write door:** `lib/orders/lifecycle.ts` holds every status move on an existing order, and `onOrderPaid`
in `lib/orders/on-paid.ts` holds what follows once an order is paid. Status is written like this
today:

- `createOrder` in `lib/orders/create.ts` and `createOrderFromAcpSession` in
  `lib/orders/create-acp.ts` create orders.
- `transitionOrder` in `lib/orders/lifecycle.ts` writes the status of an existing order. An operator
  move, through `writeOperatorStatus` in `lib/orders/operator-status.ts`, is guarded by the table in
  `lib/orders/status.ts`. A fact from `app/api/webhook/stripe/route.ts` or
  `app/api/cron/reconcile-stripe/route.ts` is recorded unguarded: a refund or a dispute has already
  happened, so no transition guard may refuse it.
- `cancelUnpaidOrder` in `lib/orders/cancel-unpaid.ts` cancels an unpaid order and gives back its
  stock and its discount use, through the same door.

A **lead** arrives through `POST /api/inquiries` or `app/actions/lead.ts`. A **quote** (planned) is an
`Order` in `quote` status, not a table of its own. The `orders.create` tool is the storefront chat's
checkout: it reads the customer's cart from cookies. An operator's order will come from a quote,
through `quotes.to_order` (planned).

| Model | Holds |
|---|---|
| `Lead` | An inquiry from any form, with `source` and `data` for custom forms |
| `Cart` | A visitor's cart, written by `lib/cart.ts` |
| `CartItem` | One line in a cart |
| `AbandonedCartLog` | One row per cart whose recovery mail went out, so it goes once |
| `Order` | Buyer, addresses, `status`, totals and the money snapshot |
| `OrderItem` | One line, with a snapshot of name and price that outlives the product |
| `OrderNote` | The order's timeline: status moves, refunds, tracking and private notes |
| `OrderStatus` | Labels and rules per status. Nothing reads it yet: `lib/orders/status.ts` decides |
| `NumberSequence` | Gap-free counters for order numbers. Nothing uses it yet |
| `Return` | A return an operator registered. `restocked` makes sure stock goes back once |
| `ReturnItem` | One line in a return |
| `FulfillmentOrder` | The part of an order routed to one supplier, written by `lib/fulfillment.ts` |
| `Subscription` | A customer's Stripe subscription, written by `lib/subscriptions.ts` |
| `ProcessedWebhookEvent` | Payment webhook events already handled, so a retry does nothing |
| `AcpCheckoutSession` | An agent's checkout session, written by `lib/acp/` |
| `AcpIdempotencyKey` | The stored answer to an agent's completed checkout, for its retries |
| `EscrowTransaction` | Money held for an agent purchase until the work is proven |
| `PoTEProof` | The proof that releases or refunds an escrow |

## Money

Prices, discounts and shipping. Every amount is an integer in minor units.

**Write door:** `lib/pricing.ts` and `lib/shipping/resolve.ts` (planned). This aggregate is mostly
calculation. Every amount should take one path: unit price → `calcPriceBreakdown` → shipping →
`convertMinor` → the order's snapshot → the payment provider.

- **Unit price.** `unitPriceDkk` in `lib/pricing.ts` is the one place for "the variant's price, else
  the product's". A line total multiplies it, and `OrderItem.unitPriceDkk` is its snapshot, taken when
  the order is placed.
- **Totals.** `calcPriceBreakdown` in `lib/pricing.ts`, with `validateDiscountCode` in
  `lib/discount.ts` for codes.
- **Shipping.** Checkout charges `calcShipping`: the flat rate in `brand.policies`. The other two
  sources do not reach it: `resolveShipping` in `lib/shipping/zones.ts` has no callers yet, and
  `settings.update_shipping` writes a row checkout does not read.
- **Currency.** `convertMinor` in `lib/money.ts`. An order keeps its own `currency` and `fxRate`.
- **VAT.** There is no VAT engine here and none is planned: an invoice comes from the accounting
  system. `vatBreakdown` in `lib/tax.ts` has no runtime callers, and nothing writes `Order.vatOere`.

| Model | Holds |
|---|---|
| `DiscountCode` | A code, its value and how often it has been used |
| `ShippingSettings` | A fee and a free-shipping threshold. Checkout does not read it |
| `ShippingZone` | A group of countries. Stored, but checkout does not charge from it |
| `ShippingRate` | A rate in a zone. Stored, but checkout does not charge from it |

## Customer

Who buys and who signs in.

**Write door:** there is no single door, and none is planned. Auth.js writes through its adapter in
`lib/auth.ts`, password resets through `lib/auth/password-reset.ts`, and a customer's own changes
through the actions under `app/[locale]/account/`. An erasure always goes through
`lib/gdpr/erase.ts`; `lib/gdpr/pii-map.ts` lists what it covers.

| Model | Holds |
|---|---|
| `User` | A customer or an admin: e-mail, role and saved address |
| `Account` | A sign-in method, kept by Auth.js |
| `VerificationToken` | A one-time magic-link token, kept by Auth.js |
| `PasswordResetToken` | A hashed one-time reset token |
| `Subscriber` | A newsletter sign-up, written by `lib/newsletter.ts` |
| `WishlistItem` | A product a signed-in customer saved |
| `DataErasureRequest` | The record of an erasure an admin ran |

## Content

What the shop says.

**Write door:** the tools in `lib/tools/pages.ts`, `lib/tools/services.ts` and `lib/tools/posts.ts`.
Redirects go through `lib/redirects/store.ts`. Some admin actions, such as those in
`app/admin/services/actions.ts`, still write directly, with no audit.

| Model | Holds |
|---|---|
| `Page` | A CMS page |
| `Service` | A service with its own page |
| `Post` | A blog post |
| `Redirect` | An old path and where it goes now |
| `SeoSnapshot` (old) | Search-performance rows nothing writes |
| `GeoSnapshot` | Whether an AI answer cited the brand, written by `lib/seo/` |
| `SeoExperiment` | A copy change measured against a baseline, written by `lib/seo/` |

## Settings

How this one shop is set up.

**Write door:** there is no single door, and none is planned. Use `lib/tools/settings.ts` for
branding and copy, and `lib/feature-flags/apply.ts` for runtime flags. Keys for outside services go
through `app/admin/integrations/actions.ts`. The move from an old site has its own door,
`lib/migration/store.ts`. Identity starts in `brand.config.ts`; `lib/identity.ts` decides when a row
here may override `storeName` or `ecommerceEnabled`.

| Model | Holds |
|---|---|
| `BrandingSettings` | The one row of cosmetics: tagline, logo, theme, design, domain, flag overrides |
| `IntegrationSettings` | The one row of keys and settings for outside services |
| `GoogleConnection` | The one Google Workspace connection |
| `MigrationProject` | A move from an old site: its source, freeze and attestations |
| `MigrationUrlMap` | One frozen old URL and what it should answer now |
| `MigrationCheckRun` | One run of a check on that move |
| `MigrationJob` (old) | An unused job table from the Hoptify plugin |

## Agent/audit

Who may do what, and the record of what was done.

**Write door:** `invokeTool` in `lib/tools/registry.ts` is the one path for REST, MCP and chat: it
checks the scope against `lib/scopes.ts` and validates the input. `withAudit` in `lib/audit.ts` writes
the audit entry for each write; a few paths, such as the payment webhook, write their own row. Keys go
through `app/admin/api-keys/actions.ts` and `lib/api-auth.ts`, OAuth through `lib/ucp/oauth.ts`.

**Naming tools.** A new tool is named `<prefix>.<verb>`, lives in `lib/tools/<prefix>.ts`, and its
prefix uses one scope domain. Sixteen older tools live elsewhere and five older prefixes span two
scope domains. They are frozen as they are, and nothing is renamed. The catalogue of tools and scopes
is `docs/scopes-and-tools.md`.

| Model | Holds |
|---|---|
| `AuditLog` | One row per audited write: who, which tool, before and after |
| `ApiKey` | An agent's key, stored as a hash, with its scopes |
| `OAuthClient` | A registered OAuth client |
| `OAuthAuthCode` | A one-time authorization code, stored as a hash |
| `OAuthToken` | An access or refresh token, stored as a hash |
| `AgentCard` | The signed card a buying agent reads about this shop |
| `AgenticJWT` | A log of signed agent requests |
| `RegistryHit` | An anonymous count per item served from the component registry |

## Ports

| Port | What it connects | Today | Planned |
|---|---|---|---|
| **PaymentProvider** | Taking and returning money | No interface. `lib/stripe.ts`, `lib/orders/create.ts` and the webhook talk to Stripe directly | An interface with Stripe behind it, so a second provider needs no change to checkout |
| **Accounting exit** | Handing orders to the books | `lib/invoicing/` defines `InvoiceProvider`, with a Stripe adapter and two stubs. Nothing calls it at runtime | `orders.export` hands orders over, and the invoice comes from the accounting system |
| **Source importer** | Reading an old shop in | `lib/woo/` reads a WooCommerce shop with GET only and plans an import as a dry run (`migration.woo_plan`). It writes nothing to the catalogue. `lib/import/` brings scraped pages in as drafts | The write step, through the catalogue's door |
| **Supplier stock** | Reading what a supplier has | Only the other direction: `lib/fulfillment.ts` sends order lines to a supplier | A stock feed |

## Decisions

- **Invoices reuse what is there.** `Order.invoiceProvider`, `Order.invoiceId` and
  `Order.invoicePdfUrl` will hold the accounting system's reference. Nothing writes them yet, and
  there are no new invoice columns.
- **Payment references get general names.** `Order.paymentProvider` and `Order.paymentRef` (planned)
  take over from `Order.stripePaymentIntentId`, which stays as a read fallback and is never dropped.
- **A quote is an order.** It is an `Order` in `quote` status (planned). There is no quote table.
- **Old tables stay.** `MigrationJob` and `SeoSnapshot` have no code behind them. They are marked old
  and never dropped, because a shop's database may hold them.

## What is still duplicated

The doors exist because the same write grew up in many places. `tests/unit/domain-ratchets.test.ts`
walks the engine and pins five counts, which may only fall:

- writes to `Order.status`;
- the inline rule "the variant's price, else the product's", which is down to none outside
  `lib/pricing.ts`;
- files that write `Product`;
- files that write `BrandingSettings`;
- reads of a runtime flag from `brand.config.ts`, which a switch in `/admin/features` cannot reach.

The pins skip in a scaffold, where your own code is yours to write. The same test file holds the
tool-naming rule above, and `tests/unit/domain-model-doc.test.ts` keeps this document in step with
`prisma/schema.prisma`.
