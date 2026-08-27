# WebMCP — in-browser agent tools

Every site scaffolded from this engine can be **agent-ready by default**: with one
feature flag (`brand.features.webMcp`), the storefront registers typed,
page-contextual tools via [`document.modelContext`](https://webmachinelearning.github.io/webmcp/)
(the WebMCP draft — W3C WebML CG, Chrome origin trial, supported natively by
ChatGPT's built-in browser). An in-browser AI agent acts through a real API
instead of guessing at the DOM — while the human keeps the checkout.

**Live demo:** <https://demo.cartwright.app> (Northbound Coffee Roasters — see
[Try it](#try-it) below, or open `/en/webmcp-check` on the demo for the live
inventory).

## The tool inventory

| Surface | Tool | Binds to | What it does |
|---|---|---|---|
| Site-wide (layout) | `search_products` | `products.search` | Free-text catalogue search (read-only) |
| Site-wide | `get_cart` | `cart.get_summary` | Full cart summary with line handles, stock ceilings, structured money |
| Site-wide | `navigate` | — (navigation) | Same-origin path navigation only |
| Catalogue page | `list_visible_products` | `products.search` | Exactly the server-narrowed list the human sees + active filter state — zero network |
| Catalogue page | `filter_products` | — (navigation) | Schema is **server-derived** (live category slugs as enum, sort whitelist); validates, then navigates |
| Product page | `add_current_product_to_cart` | `cart.add` | Adds *the page's* product — description carries live variants, prices, stock; variant required when variants exist |
| Cart page | `update_cart_item_quantity` | `cart.update_quantity` | 0–99 (0 removes); rejects non-numbers outright |
| Cart page | `remove_cart_item` | `cart.remove` | Returns what was removed + the fresh cart |
| Cart page | `go_to_checkout` | — (navigation) | **Opens** checkout for the human — nothing more |
| Form (declarative) | `site_search` | — (the human's form) | The search form itself, `toolautosubmit` (read-only) |
| Form (declarative) | `contact_store` | — | The contact form — no autosubmit; the human confirms |
| Form (declarative) | `newsletter_signup` | — | The newsletter form — no autosubmit |
| Design pack (crema) | `calculate_brew_ratio` | — (pure compute) | The homepage brew calculator's math, typed for agents — same module, can never disagree |

## Architecture

Three registration styles, one shared core (`lib/model-context.ts` —
`document.modelContext` with a `navigator.modelContext` fallback, sequential
*awaited* registration, per-tool error isolation, `AbortSignal` teardown — the
draft has no `unregisterTool`):

1. **Imperative, per-route.** Site-wide tools live in one registrar mounted by
   the layout; page-contextual tools live in server-gated mounts on the PLP,
   PDP and cart page. The server narrows exactly what the page knows (the
   PDP's live variants and stock, the PLP's filtered list) into the tool
   descriptor — so the agent reads what the human sees. Navigation re-runs
   the mounts: tools appear and disappear with the route.
2. **Declarative forms.** The engine's search/contact/newsletter forms carry
   `toolname` / `tooldescription` / `toolparamdescription` attributes — the
   *form itself* is the tool, answered via `SubmitEvent.respondWith`.
   Autosubmit only on read-only search. The checkout form is deliberately
   **not** annotated.
3. **Pack tools.** A design pack can ship its own tools
   (`DesignPack.webMcpToolBindings`): crema's brew calculator is the
   reference — a page capability the human uses as a widget, typed for
   agents from the same math module.

### The safety moat (test-enforced)

Every registered tool declares which customer-safe operation it maps to, and
`tests/unit/webmcp-moat.test.ts` holds the whole browser surface to the
`products.*` / `cart.*` families — across the layout, the per-route mounts
**and every registered design pack** (aggregated via the design registry).
Empty bindings are legal only for two explicitly enumerated classes
(navigation-only, pure compute) plus the declarative-form carve-out.

The practical line: **no order-placing tool exists in the browser.**
`go_to_checkout` only opens the page; the purchase stays the human's. Every
cart mutation returns the fresh cart so the agent can verify what actually
happened instead of assuming.

### Off means off

The flag is default-off and byte-exact: with `webMcp` off, no registrar
mounts, no `tool*` attribute renders, no origin-trial meta is emitted — the
HTML is byte-identical. (It is a runtime-tier flag: a merchant can turn it on
from `/admin/features` without a deploy.)

## Try it

- **ChatGPT desktop app** — open the demo in the built-in browser and ask
  ChatGPT to use the shop; WebMCP is supported natively.
- **Chrome 146+** — enable `chrome://flags/#enable-webmcp-testing` and reload.
  Chrome 149+ can also run it via an origin-trial token
  (`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` — the layout emits the meta tag
  when the flag is on).
- **WebMCP Inspector** (Chrome DevTools extension) — shows every tool
  registered on the current page and lets you invoke them with custom input.
- On any WebMCP-enabled shop, `/{locale}/webmcp-check` shows the full
  inventory, the moat, and a live registration panel.

## Testing

- ~90 unit tests across the registrar, the PLP/PDP/cart mounts, the
  declarative forms, the brew tool, the cart-summary contract and the moat.
- A Playwright e2e spec (`tests/e2e/webmcp.spec.ts`) installs a faithful fake
  `document.modelContext` before any page script and walks
  home → catalogue → PDP → cart → checkout: contextual tool sets appear and
  disappear per route, one real add-to-cart round-trip mutates the dev DB,
  and checkout is asserted tool-free.

## Timeline

The engine (storefront, cart, checkout, admin, MCP/REST agent APIs)
pre-exists. **The entire WebMCP surface was built 27 Aug – 3 Sep 2026**
(the WebMCP Challenge window), in reviewable, timestamped increments:

| Date (2026) | Change |
|---|---|
| Aug 27 | Foundation: shared detection/registration core, verification-rich cart data (`AgentCartSummary`, structured money), global registrar hardening |
| Aug 27 | Contextual per-route tools: the PDP sells its own product, the cart can undo |
| Aug 27 | Declarative form annotations — the forms themselves become agent tools |
| Aug 27 | Catalogue-page tools (`list_visible_products`, `filter_products` with server-derived schema) |
| Aug 27 | Pack tools: `DesignPack.webMcpToolBindings` + crema's `calculate_brew_ratio`; registry-driven moat aggregation |
| Aug 27 | `/webmcp-check` agent-tools showcase; e2e agent-surface spec |

Commit history in this repository carries the exact timestamps.
