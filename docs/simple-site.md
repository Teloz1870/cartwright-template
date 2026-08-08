# The simple site — a minimal Cartwright, honestly documented

You want a plain website: pages, a contact form, good SEO — none of the
webshop, none of the agentic surfaces. This is the recipe for the leanest
Cartwright you can run **today**, and an honest list of what you cannot turn
off yet.

## The recipe

1. **Scaffold light + website mode** (both are the defaults):

   ```bash
   npx create-cartwright@latest my-site
   ```

   The `light` profile prunes the heavy full-only modules (agent-marketplace/
   A2A, UCP identity-linking, WebMCP, hoptify and the non-curated design packs)
   from the scaffold entirely. `brand.mode: "website"` + `ecommerceEnabled:
   false` lock commerce out at the identity layer — a database row can never
   flip a website into a webshop (`lib/brand.ts` enforces this).

2. **Leave the flags off.** Only 8 of the ~72 `brand.features.*` flags default
   on. The advanced systems (reviews, voice shop, AI stylist variants,
   subscriptions, multi-currency, ACP checkout, A2A, …) are opt-in — a fresh
   website-mode scaffold has none of them active.

3. **Decide about the agentic surface.** Two flags are on by default because
   they are Cartwright's calling card — turn them off in `/admin/features` if
   you want a fully quiet site:
   - `mcpPublic` — off ⇒ `/api/mcp` and `/api/v1/tools` return 404 (near
     enough to a site that never had them; the exact residue is in
     [mcp.md](mcp.md)).
   - `aiStylist` — the storefront AI assistant.

   Website mode already 404s the commerce endpoints: the ACP product feed
   (`/api/acp/feed`), ACP checkout, and the Google Merchant feed all gate on
   `ecommerceEnabled`; A2A endpoints gate on the `a2a` flag (off by default).

4. **Trim the visible chrome.** `cartwrightBadge` (the "Built with Cartwright"
   footer referral) is default-on and honest to disable — flipping it in
   `/admin/features` removes the footer badge, the llms.txt block and the
   `/built-with-cartwright` JSON-LD together.

## What you still carry (the honest part)

- **The code ships even when flags are off.** Most flags gate at runtime, not
  compile time — disabled features still exist in the repo and the server
  bundle. Off means unreachable (404/not rendered), not absent.
- **The database and admin are always there.** Even a plain website runs
  Prisma (pages, settings, audit) and the full `/admin`. There is no
  admin-lite mode yet.
- **`/.well-known/mcp.json` and `llms.txt` stay on** — they are discovery
  metadata, not executable surface.

## Where this is heading

A true `site` profile — no database, no admin, no auth, no commerce or agent
code in the scaffold at all, generated additively from module manifests — is
designed and in progress. Until it ships, the recipe above is the supported
path, and everything it leaves in place is inert and unreachable rather than
gone. Track releases in the [CHANGELOG](../CHANGELOG.md).

## See also

- [`docs/getting-started.md`](getting-started.md) — the general first-run guide
- [`docs/scopes-and-tools.md`](scopes-and-tools.md) — what the tool surface is,
  when you *do* want agents driving the site
- [`docs/versioning-policy.md`](versioning-policy.md) — how updates reach you
