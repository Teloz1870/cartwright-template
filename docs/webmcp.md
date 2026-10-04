# WebMCP — in-browser agent tools

Webshop scaffolds from this engine are **WebMCP-native out of the box**
(`npx create-cartwright my-shop --template coffee` ships `webMcp: true` since
create-cartwright 2.8.0); every other database-backed scaffold carries the whole
surface one flag away (`brand.features.webMcp`). The storefront registers typed,
page-contextual tools via [`document.modelContext`](https://webmachinelearning.github.io/webmcp/)
(the WebMCP draft — W3C WebML CG, Chrome origin trial, supported natively by
ChatGPT's built-in browser). An in-browser AI agent acts through a real API
instead of guessing at the DOM — while the human keeps the checkout.

**Live demo:** <https://demo.cartwright.app> (Northbound Coffee Roasters — see
[Try it](#try-it) below, or open `/en/webmcp-check` on the demo for the live
inventory).

## What each profile ships

| Scaffold profile | WebMCP surface |
|---|---|
| `light` (default) | **Everything** — registrar, per-route mounts, declarative forms, `/webmcp-check`, the full test suite. **ON when scaffolded with a webshop template**; dormant behind the `webMcp` flag otherwise |
| `full` | Everything, same flag |
| `site` (static, no DB) | Nothing — there is no runtime to register tools against |

### Turning it on

`webMcp` is a runtime flag with an e-commerce precondition. Webshop templates
(`npx create-cartwright --template coffee | sunglasses | generic`) scaffold with it
**already on**. On any other webshop config, flip it in `/admin/features` — no
deploy needed. On a website-mode scaffold, first set `mode: "webshop"` in
`brand.config.ts` and redeploy, then flip the flag.

## The tool inventory

| Surface | Tool | Binds to | What it does |
|---|---|---|---|
| Site-wide (layout) | `search_products` | `products.search` | Free-text catalogue search (read-only) |
| Site-wide | `get_cart` | `cart.get_summary` | Full cart summary with line handles, stock ceilings, structured money |
| Site-wide | `navigate` | — (navigation) | Same-origin path navigation only |
| Catalogue page | `list_visible_products` | `products.search` | Exactly the server-narrowed list the human sees + active filter state — zero network |
| Catalogue page | `filter_products` | — (navigation) | Schema is **server-derived** (live category slugs as enum, sort whitelist); validates, then navigates |
| Product page | `add_current_product_to_cart` | `cart.add` | Adds *the page's* product — description carries live variants, prices, stock; variant required when variants exist |
| Cart page | `update_cart_item_quantity` | `cart.update_quantity` | 1–99, single-function (removal belongs to `remove_cart_item`); line ids enumerated in the schema; rejects non-numbers outright |
| Cart page | `remove_cart_item` | `cart.remove` | Returns what was removed + the fresh cart |
| Cart page | `go_to_checkout` | — (navigation) | **Opens** checkout for the human — nothing more |
| Form (declarative) | `site_search` | — (the human's form) | The search form itself, `toolautosubmit` (read-only) |
| Form (declarative) | `contact_store` | — | The contact form — no autosubmit; the human confirms |
| Form (declarative) | `newsletter_signup` | — | The newsletter form — no autosubmit |
| Design pack (crema) | `calculate_brew_ratio` | `products.search` | The homepage brew calculator's math, typed for agents — same module, can never disagree — plus the coffee it resolves to on this shop's shelf (read-only; the buying happens on the product page) |

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
   the mounts: tools appear and disappear with the route. This is
   progressive disclosure in the sense of the tool-collections discussion
   ([webmcp#255](https://github.com/webmachinelearning/webmcp/issues/255)):
   the agent never faces the whole catalogue of tools at once — each page
   exposes exactly the collection that makes sense there.
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

### The framework failure modes (webmcp#199) — and how the engine avoids them

[webmcp#199](https://github.com/webmachinelearning/webmcp/issues/199) catalogues
what goes wrong when frameworks meet WebMCP. The engine's answer, in shipped,
test-pinned code:

- **Stale closures** — `execute()` reads state freshly at execution time:
  `get_cart` calls the server action when invoked, `search_products` fetches
  when invoked. Per-route tools close over the server-render snapshot only for
  *descriptions and whitelists*; every mutation re-validates server-side and
  returns the fresh cart.
- **Registry flicker** — effect dependencies are the *serialized* props, so a
  re-render with identical data never re-registers; a revalidate with new data
  aborts-then-registers exactly once. Registration follows
  "register as rarely as possible, read state as freshly as possible".
- **Route teardown** — every mount owns an `AbortController`; React runs
  cleanup before the next route's effects, so the old registration's signal is
  aborted strictly before a name could reappear (current-spec duplicate-name
  rejection is emulated in the e2e fake, and a soft-navigation spec proves the
  swap inside one document).
- **Crash containment** — registrations are individually try/caught (one
  rejecting tool cannot drop the rest), no `modelContext` means a clean no-op,
  and the flag-off render is byte-identical.

### Off means off

Off is byte-exact: with `webMcp` off, no registrar mounts, no `tool*`
attribute renders, no origin-trial meta is emitted — the HTML is
byte-identical. (It is a runtime-tier flag: a merchant can toggle it from
`/admin/features` without a deploy — which is also why scaffolding webshop
templates with it on is safe: turning it off is one click.)

## Try it

- **ChatGPT desktop app** — open the demo in the built-in browser and ask
  ChatGPT to use the shop; WebMCP is supported natively.
- **Chrome 146+** — enable `chrome://flags/#enable-webmcp-testing` and reload.
  Chrome 149+ can also run it via an origin-trial token
  (`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` — the layout emits the meta tag
  when the flag is on).
- **Chrome DevTools → Application → WebMCP** — lists every tool with its
  schema, logs invocations with inputs/outputs, and can execute a tool by
  hand (it also surfaces schema-validation errors).
- **WebMCP Inspector** (Chrome extension) — shows every tool registered on
  the current page and lets you invoke them with custom input.
- On any WebMCP-enabled shop, `/{locale}/webmcp-check` shows the full
  inventory grouped by collection, an intent-first tool explorer ("I want
  to… → the tool + a copyable example" — a genre homage to
  [array-explorer](https://github.com/sdras/array-explorer)), the moat, and
  a live registration panel. The page loads the Chrome team's WebMCP
  polyfill ([GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools),
  Apache-2.0, vendored verbatim) as a fallback, so the demonstration works
  in any browser — the panel discloses when the polyfill, not the browser,
  is providing `document.modelContext`.

## Testing

- ~90 unit tests across the registrar, the PLP/PDP/cart mounts, the
  declarative forms, the brew tool, the cart-summary contract and the moat.
- A Playwright e2e spec (`tests/e2e/webmcp.spec.ts`, engine repo) installs a faithful fake
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

The engine repository's commit history carries the exact timestamps (this public
mirror publishes snapshot syncs plus release tags — `v0.50.0` and later bracket
the window; per-PR history lives in the engine repo and is available on request).
