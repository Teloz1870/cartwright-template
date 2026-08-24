# Cartwright agentic-readiness handoff / overdragelse

Statusdato: 24. august 2026. Dette dokument beskriver den aktuelle branch og må ikke
bruges som dokumentation for en ny offentlig score, før produktionen er opdateret og
scannet igen.

## Dansk

### Mål og baseline

- Offentligt mål: `https://demo.cartwright.app/da` (Northbound Coffee Roasters).
- Baseline: **52/100**, scannet 22. august 2026 kl. 18:46:13 UTC.
- Scorekort: https://is-agentic.com/scan/demo.cartwright.app/da
- Den nuværende score er stale evidens for den gamle production. Marketing må først
  bruge et nyt `X/100`-tal, når et frisk offentligt scorekort viser dato, domæne og den
  nye production.
- `http://localhost:3001/en` er kun den lokale designreference. Processen på port 3001
  er ikke ændret og er ikke score-evidens.

### Aktiv levering

- Template-repository: `Teloz1870/cartwright-template`
- Branch: `feat/agentic-final-gaps`
- Base: upstream `main` på `5b50791`
- De tre implementeringscommits før denne handoff er `67623af`, `0495e7f` og `e3496be`.
- PR-URL udfyldes efter oprettelse; merge/deploy-commit må først udfyldes efter review.
- CLI/docs-repository: `Teloz1870/cartwright-app`, branch `docs/adoption-polish`.
- GitHub Issues er aktiveret på template-repository'et. Bug-/feature-forms,
  `needs-triage` og `SUPPORT.md` peger brugere til de rigtige support- og
  sikkerhedskanaler.

### Hvad templaten ændrer

- Anonym, rate-limited MCP- og REST-læsning er begrænset til fem tools:
  `products.search`, `products.get`, `categories.list`, `site.list_pages` og
  `site.get_page`.
- Kun publicerede produkter/sider kan læses anonymt. Drafts, kunder, ordrer,
  administration, checkout og alle writes kræver fortsat en gyldig Bearer-key og de
  korrekte scopes. En ugyldig key falder aldrig tilbage til anonym adgang.
- Autentificeret MCP-discovery viser kun tools, som nøglens scopes dækker. Scope
  håndhæves igen ved invocation.
- MCP bruger konkrete Zod input/output-skemaer, `structuredContent`, read-only
  annotations og én releases kompatibilitet for legacy `{args:{...}}`.
- Read-only MCP-resourcer udstiller `llms.txt`, sitemap og publicerede trust-data med
  korrekte MIME-typer.
- `/openapi.json` genereres som OpenAPI 3.1 fra tool-registry'et: 88 konkrete paths,
  88 unikke operation IDs, konkrete schemas og operation-specifik security.
- `/developers` er SSR-renderet og dokumenterer MCP, REST, OpenAPI, auth, scopes,
  rate limits, Problem Details, versionering og deprecation.
- Agent-REST og relevante discovery-fejl returnerer `application/problem+json` med
  `type`, `title`, `status`, `detail`, `instance`, `code` og `resolution`; legacy
  `ok/error` er midlertidigt bevaret.
- Fælles rate limiting bruger klient-IP fra betroet ingress og returnerer
  `RateLimit-*` samt `Retry-After` ved 429. En separat auth-attempt-limiter forhindrer,
  at anonyme public reads kan udmatte key-valideringens budget.
- Runtime-resolveret brand-URL driver locale-aware canonical, hreflang, Open Graph,
  Twitter, sitemap og discovery. På Vercel bruges den eksplicitte brand/env-URL først,
  derefter production-system-URL og til sidst preview-URL.
- Organization JSON-LD indeholder legal name, supportkontakt, komplet PostalAddress og
  valideret `sameAs`. WebSite, Product, Offer, Breadcrumb og FAQ er regressionstestet.
- Locale-aware `/about`, `/privacy` og `/contact` er substantielle trust anchors med
  CMS/default-fallback og publiceret-only grænse. Legacy `/info/*` bevares kompatibelt.
- `/` og locale-home kan returnere `text/markdown` via `Accept` negotiation med korrekt
  `Vary`. Markdown-404 er en rigtig 404 med recovery-links.
- `llms.txt`, MCP server cards, RFC 9727 API catalog og et digest-verificeret public
  Agent Skill beskriver kun interfaces, der faktisk findes i profilen.
- SaaS/Cartwright marketingruter og agent-facing copy er white-label-gated, så en fork
  ikke udgiver sig for at være Cartwright/Teloz.

### Sikkerhedsmodel

- Public: kun publiceret katalog- og sideindhold, read-only, fælles per-IP budget.
- Authenticated: least-privilege discovery plus invocation-time scope enforcement.
- Anonym produktsøgning er deterministisk/leksikalsk og kalder ikke en betalt
  embedding-provider.
- Ingen OAuth, ACP, WebMCP, agentbetaling eller andre capabilities aktiveres alene for
  at optimere scoren. Discovery annoncerer dem kun, hvis de er aktiveret og virker.

### Verificeret lokalt

Templatebranch:

- `pnpm lint`: grøn, 0 warnings.
- `pnpm typecheck`: grøn.
- `pnpm test`: 253 filer, **2.611 passed**, 2 skipped.
- `pnpm build`: grøn på Next.js 16.3.0.
- `pnpm test:e2e`: **4/4** grønne.
- Kendte ikke-blokerende build-advarsler: custom Cache-Control på `/_next/static` og
  Turbopack tracing omkring den runtime-baserede plugin-installer.

Rene scaffolds fra `feat/agentic-final-gaps`:

- `light`, `full` og `site` passerer `pnpm install --frozen-lockfile`, typecheck og
  production build.
- `light` runtime: 200 på homepage, About, Privacy, Developers, `llms.txt`, sitemap,
  OpenAPI, MCP server card, anonym MCP initialize og `products.search`; anonym
  `products.create` giver 401 `application/problem+json`.
- `site` runtime: 200 på homepage, About, Privacy, Contact, `llms.txt` og sitemap;
  rigtig 404 på MCP server card, OpenAPI og Developers. `llms.txt` siger eksplicit,
  at profilen ikke har database, MCP eller tool API.
- Port 3001 blev efter smoken igen verificeret med samme PID og HTTP 200.

CLI/docs-branch:

- CLI-transformerne er idempotente mod den nye template: allerede neutral
  Cartwright-copy og egne faviconfarver giver ingen falsk warning; ukendt Teloz-copy
  advarer stadig; light-lockfilen ændrer kun dependencies, som faktisk blev fjernet.
- `create-cartwright`: 259 tests, lint, typecheck og build er grønne.
- `cartwright.app`: 226 tests, lint uden warnings, typecheck og fuld build (482 routes)
  er grønne.
- Public docs beskriver `light`, `full` og `site`, `@latest`, `db:setup`, de rigtige
  Issue-ruter og den faktiske stable/main/tag-model. Changeset er patch-only; ingen
  version eller npm-release er antaget på forhånd.

### Demoen og deploy-sikkerhed

- `demo.cartwright.app` viser fortsat Northbound Coffee Roasters. Den restaurerede,
  kendte deployment er `demo-cartwright-mo0yhwtmm-teloz-s-projects.vercel.app`,
  deployment ID `dpl_FixNsT6T66r7Zew7Lz95zq3vF6WY`.
- Demo-projektet blev verificeret som ikke Git-forbundet. Flyt derfor aldrig production
  fra en urenset arbejdsmappe; brug kun et verificeret preview/deployment fra kendt
  commit og flyt aliaset efter smoke.
- Northbound-overlayet skal bevare navn, kaffeindhold, `aurora-shop`, da/en locales,
  hero-medier, checkout/test-mode og den visuelle coffee-identitet. En Cartwright
  marketing/showcase-side må aldrig deployes på demo-domænet.

### Næste release-gates

1. Opret og review begge PR'er; merge template først fra kendt commit.
2. Byg en ny, separat Northbound-preview med template-motoren plus det bevarede
   coffee-overlay. Sammenlign homepage, PLP, PDP, cart/checkout og mobile states visuelt.
3. Probe trust-ruter, raw HTML/markdown, sitemap, `llms.txt`, OpenAPI, MCP, REST auth,
   JSON-LD, 404 og ChatGPT-User/ClaudeBot/Google-Extended/DeepSeekBot/ora-agent.
4. Flyt først derefter `demo.cartwright.app` til den kendte preview-deployment.
5. Deploy samme kendte commit/overlay-model til Solbrillen-canary og gentag kritiske
   commerce- og agent-prober.
6. Kør først efter stabil production `npx is-agentic demo.cartwright.app/da`. Hvis den
   offentlige cache stadig viser baseline, vent på et frisk snapshot.
7. Opdatér først website-claim, Claude-rapport og X-opslag, når scorekortets dato og
   deployment matcher. Brug højst fire dokumenterbare forbedringer.

## English

The active template branch makes the public agent boundary narrow, typed, discoverable,
rate-limited and profile-aware while keeping every private read and all mutations behind a
scoped Bearer key. It also adds runtime-correct metadata, substantive trust routes,
structured data regressions, markdown negotiation, generated OpenAPI, developer docs and
honest discovery that disappears from the database-free `site` profile.

Local evidence is green: 2,611 template tests (2 skipped), lint, typecheck, production
build, 4/4 Playwright flows, and clean install/typecheck/build smokes for `light`, `full`
and `site`. The companion CLI/docs branch has 259 CLI tests and 226 web tests green, with
idempotent scaffold patches and current onboarding/release documentation.

There is deliberately no new score, preview URL, merge commit or npm version claim in this
handoff. Preserve the Northbound coffee demo, deploy only a known commit plus its verified
coffee overlay, run the production probes, and then obtain a fresh public Is Agentic
scorecard before publishing any `X/100` marketing claim.
