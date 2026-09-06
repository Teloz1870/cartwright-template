# AI crawlers — search, agent & training

Three kinds of AI bots visit a shop, and they should not be treated the same:

| Category | Examples | What they do for you |
|---|---|---|
| **Search** | `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot` | Index your catalogue so AI assistants can *cite and recommend* you. Citations ≈ the new organic traffic. |
| **Agent** | `ChatGPT-User`, `Perplexity-User`, `Claude-User` | Act on a **customer's** behalf — browsing your PDPs, comparing, buying. This is revenue, not scraping. |
| **Training** | `GPTBot`, `ClaudeBot`, `Google-Extended`, `anthropic-ai`, `Applebot-Extended` | Harvest content for model training. The one category some owners want to opt out of. |

This taxonomy matches the model CDNs now enforce (Cloudflare's Search/Agent/Training
categories, July 2026).

## Choosing a policy

**Admin → SEO** (`/admin/seo`) exposes three options, written to `robots.txt` within ~30 s:

1. **Allow all** *(default, recommended)* — every category explicitly welcomed. Maximum AI
   visibility (GEO): you get cited, and shopping agents can buy from you.
2. **Block training crawlers only** — training bots are disallowed; AI search and shopping
   agents stay welcome. Pick this if "don't train on my content" matters but you still want
   AI-driven discovery and sales.
3. **Block all AI crawlers** — every AI bot disallowed (classic search engines like Google
   still index). Understand the cost: AI assistants can neither cite you nor shop from you.

The same setting is scriptable through the tool surface (`seo.set_indexing`) and is audited.

## ⚠️ If your shop sits behind Cloudflare

From **September 15, 2026**, new Cloudflare domains **block Agent and Training crawlers by
default** on ad-bearing pages (Search stays allowed). That default silently defeats every
agentic-commerce surface Cartwright ships — the product feeds, MCP server, and ACP/UCP
endpoints — because the shopping agents never reach the site, regardless of what your
`robots.txt` welcomes.

If you front your shop with Cloudflare:

1. Open **AI Crawl Control** in the Cloudflare dashboard.
2. Set the **Agent** category to *Allow* (and **Search** if it isn't already).
3. Leave **Training** at whatever matches the policy you chose above.

`robots.txt` is a request; the CDN is a wall. Make sure the two agree.
