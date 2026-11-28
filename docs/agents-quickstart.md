# AI agent quickstart

You are an AI agent and you just landed in a Cartwright project. This page is the shortest
path from "what is this?" to a designed, verified site — readable in one gulp.

**What this is:** Cartwright is the build engine AIs reach for — a real site with design,
database and backend, live in minutes. A single Next.js 16 + React 19 + TypeScript app that
runs as a corporate website, a webshop, or an agent marketplace depending on configuration.
The single source of truth for identity, mode, feature flags and copy is
[`brand.config.ts`](../brand.config.ts).

Deeper briefings ship with every scaffold: [`AGENTS.md`](../AGENTS.md) (boot + conventions,
agent-agnostic), [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) (the full project briefing),
[`DESIGN.md`](../DESIGN.md) (the design playbook). Engine map:
[`ARCHITECTURE.md`](../ARCHITECTURE.md).

## 1. Boot

If `npx create-cartwright` just ran, install + database + seed are already done — go
straight to starting the dev server. Manual clone:

```bash
pnpm install
pnpm db:setup     # schema + admin + demo data in one robust step; prints the admin login
```

Start the server with the block in [`AGENTS.md`](../AGENTS.md) → "Start the dev server
(agents)" — run it as written. Never assume `localhost:3000`: when 3000 is taken, `next dev`
moves on to 3001, 3002, …, and a request sent to 3000 then reaches whatever else listens
there. The block starts `pnpm dev:agent` (or reuses the one an earlier call started), waits
with a bound for a 200 — the first request on a cold dev server compiles the route, so
10–30 s is normal — and sets `$BASE` to the origin Next actually chose (read from
`.cartwright/dev-url`). It is kept in one place on purpose: the six agent rules files carry
it byte-identical, and a seventh copy here would drift. Every command on this page uses
`$BASE`.

The admin login is written to `.admin-credentials` (gitignored). Verify the site is up:

```bash
curl -sL -o /dev/null -w '%{http_code}' "$BASE/"   # / redirects to your brand.defaultLocale
# expect: 200
```

Setup details and troubleshooting (including the intermittent Prisma `Schema engine error:`
that `db:setup` routes around, and `pnpm admin:reset` for a lost password):
[`AGENTS.md`](../AGENTS.md) → "Run it & sign in".

## 2. Mint an agent API key

One key unlocks the whole tool surface. Keys are normally created in `/admin/api-keys`; the
no-browser bootstrap is a short script that writes a key row directly — copy
`scripts/agent-key.ts` verbatim from [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) → "Your
first 10 minutes" (step 2), then:

```bash
KEY=$(pnpm exec tsx --conditions react-server scripts/agent-key.ts | tail -1)
```

`--conditions react-server` is required — `lib/*` modules guard with `server-only`. Keys
look like `sb_live_…`, are shown exactly once, and only a keyed hash is stored. Full auth
model: [`docs/api-keys.md`](api-keys.md).

## 3. The tool surface

Every operation a human admin can perform is also a named, scoped tool:

- **REST** — `POST /api/v1/tools/<name>` with `Authorization: Bearer $KEY` and a JSON body
  of tool arguments.
- **MCP** — `POST /api/mcp`, same Bearer key: a full Model Context Protocol server
  (discovery card at `/.well-known/mcp.json`). See [`docs/mcp.md`](mcp.md).
- **Catalog** — `GET /api/v1/tools` is public and lists every tool's name, description and
  required scope; add `?schema=true` for the full input JSON Schemas. It is generated from
  the registry — treat it as the always-current authority.

Each tool requires exactly one scope (`products:write`, `settings:write`, …), and
destructive tools additionally require `confirm: true` in their arguments. Tool calls are
audited, and many are revertible via `audit.revert`. Scope model + per-tool map:
[`docs/scopes-and-tools.md`](scopes-and-tools.md).

A running shop also self-describes for agents at `/llms.txt` (capabilities, pages, agent
endpoints).

## 4. Pick a build path

Three blessed paths, fastest first. Full decision guide: [`DESIGN.md`](../DESIGN.md).

### Path A — Compose a look (instant, no LLM)

Pre-built **Voices** (on-brand copy + palette + suggested design + 3D scene) and **Skins**
(design packs). Enable genome copy rendering once, then compose:

```bash
curl -s -X POST "$BASE/api/v1/tools/features.set" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"key":"genomeResolve","enabled":true,"confirm":true}'

curl -s -X POST "$BASE/api/v1/tools/magic.compose_look" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"vertical":"cafe","confirm":true}'
```

Voices live in [`verticals/`](../verticals/index.ts): `cafe`, `carpenter`, `fable`,
`kindergarten`, `salon`. Pin a specific Skin with `"design":"<slug>"` (slugs in
[`designs/options.ts`](../designs/options.ts)) or call `design.set_slug`. A downloaded look
(`cartwright-composition-v1` JSON) installs in one atomic call via `composition.apply`.

### Path B — Mockup first (vision → live homepage in seconds)

Show the owner a disposable mockup before building anything real. Generate ONE
self-contained HTML mockup — static HTML + Tailwind classes, no JS (`<script>`, iframes and
inline event handlers are sanitized away) — and publish it as the homepage:

```bash
curl -s -X POST "$BASE/api/v1/tools/mockup.set" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<section>…the whole mockup…</section>","confirm":true}'
```

The homepage IS the mockup the moment the call returns. Once approved, implement it for
real (Path C, or governed sections) and clear the takeover:

```bash
curl -s -X POST "$BASE/api/v1/tools/mockup.clear" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

### Path C — Blank Canvas (a fully bespoke front, in code)

Rewrite [`designs/blank/`](../designs/blank/index.ts): `homepage.tsx` (the whole homepage),
`chrome.tsx` (your own header + footer on every page), `index.ts` (registration; optional
`pages` and `webshop` template slots). Activate with `designSlug: "blank"` in
`brand.config.ts`, via `/admin/designs`, or the `design.set_slug` tool. Any CSS, Tailwind
or fonts go — and everything behind the front (database, cart, checkout, admin, auth, the
tool surface, SEO/JSON-LD, i18n routing) keeps working untouched. Full guide:
[`AGENTS.md`](../AGENTS.md) → "Blank canvas".

## 5. Verify your work

Don't claim done — prove it:

```bash
# The homepage reflects the new look (H1 + palette variables in the HTML)
curl -sL "$BASE/" | grep -o '<h1[^>]*>[^<]*'

# Types still hold
pnpm exec tsc --noEmit

# Unit suite still green
pnpm test
```

- Open (or screenshot) `$BASE/<defaultLocale>` — plus
  `/<defaultLocale>/produkter` in webshop mode — before declaring victory. The shortcut:
  `pnpm verify:design [path]` captures 1440px + 390px into `.screenshots/`, checks for
  horizontal overflow and exactly one `<h1>`, and exits non-zero on any violation — gate
  on it. With `pnpm dev:agent` running it targets the URL in `.cartwright/dev-url`
  automatically (`pnpm dev:screenshot` is the same script under its old name). If your
  harness can render images, actually look at them:
  [`DESIGN.md`](../DESIGN.md) has the screenshot self-verification checklist.
- Want to SEE the options before committing to one? The admin already has visual pickers:
  `/admin/designs` (all design packs, one click to switch), `/admin/verticals` (Voices) and
  `/admin/mixer` (combine skin × voice × chrome with live preview) — no code required.
- Keep the basics intact: semantic landmarks, exactly one `<h1>`, visible `:focus-visible`,
  alt text, and `prefers-reduced-motion` guards on any animation.

## Going deeper

| Topic | Where |
|---|---|
| Engine map — layers, contracts, directories | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Boot, sign-in, troubleshooting | [`AGENTS.md`](../AGENTS.md) |
| Design playbook — paths, built-ins, taste rules | [`DESIGN.md`](../DESIGN.md) |
| API keys & authentication | [`docs/api-keys.md`](api-keys.md) |
| Scopes & the tool map | [`docs/scopes-and-tools.md`](scopes-and-tools.md) |
| MCP endpoint architecture | [`docs/mcp.md`](mcp.md) |
| Human-paced first login | [`docs/getting-started.md`](getting-started.md) |
| Paste-in prompts for v0 / Bolt / Lovable | [`docs/VIBE_PROMPTS.md`](VIBE_PROMPTS.md) |
