# Cartwright agentic-readiness handoff / overdragelse

## Dansk

### Baseline

- Mål: `https://demo.cartwright.app/da`
- Reproduceret med `npx is-agentic demo.cartwright.app/da`
- Resultat: **52/100** den 22. august 2026 kl. 18:46:13 UTC
- Offentligt scorekort: https://is-agentic.com/scan/demo.cartwright.app/da
- Baseline havde 7 failures og 12 partials. Marketing må ikke bruge et nyt tal, før et frisk offentligt produktionsscan dokumenterer det.

### Hvad branchen ændrer

- Anonym, per-IP rate-limited MCP/REST-læsning er begrænset til fem allowlistede tools: produkt-søgning/opslag, kategorier og publicerede sider.
- Drafts, private data og alle writes forbliver bag Bearer-key og eksisterende scopes. En ugyldig key falder aldrig tilbage til anonym adgang.
- En autentificeret MCP-session opdager nu kun de tools, API-nøglens scopes faktisk dækker; en smal read-key kan derfor hverken se eller kalde write-tools. Fuld-scoped operatørnøgler beholder den fulde tilladte registry-overflade.
- Den offentlige trust-resource læser kun publicerede CMS-sider og falder tilbage til template-defaults, hvis siden mangler; drafts kan ikke sive ud via resource-laget.
- MCP publicerer konkrete Zod-input- og outputskemaer direkte, returnerer `structuredContent`, annoterer offentlige tools som read-only/non-destructive og accepterer legacy `{args:{…}}` i én kompatibilitetsperiode.
- Read-only MCP-resourcer publicerer `llms.txt`, sitemap og offentlige trust-data.
- MCP-serverkortet publiceres på både `/.well-known/mcp`, `/.well-known/mcp/server-card.json` og legacy `/.well-known/mcp.json` med fælles identitet, version, transport og den eksakte public allowlist.
- `/.well-known/api-catalog` publicerer RFC 9727-discovery for REST, OpenAPI, udviklerdokumentation og Agent Skills. Et digest-verificeret `public-site-research`-skill beskriver sikker, kildehenvist brug af den offentlige overflade.
- `/openapi.json` genereres som OpenAPI 3.1 fra registry'et; `/developers` dokumenterer MCP, REST, auth, scopes, limits, problem-details samt versionering/deprecation.
- Agent-API-fejl bruger `application/problem+json` med kode og løsningsforslag, mens `ok/error` beholdes midlertidigt.
- Den globale Upstash-proxy returnerer samme komplette Problem Details-model og `RateLimit-*`/`Retry-After` ved 429; REST og MCP deler det samme per-IP-budget.
- Den fælles fejlmodel dækker også slukkede agent-interfaces og ukendte tool-manifester på REST- og discovery-ruter; MCP-protokolfejl forbliver korrekt JSON-RPC.
- Runtime brand-URL driver canonical/hreflang og alle agent-discovery-URL'er uden dobbelte skråstreger. Contact, About og Privacy har locale-aware canonical/hreflang/OG/Twitter metadata. Organization JSON-LD indeholder legalName, supportkontakt og PostalAddress.
- Organization `sameAs` linker Cartwright til det verificerede GitHub-repository og den officielle npm-pakke; setup-audit advarer forks, der ikke udskifter disse authority-profiler.
- `/about` og `/privacy` er stabile locale-ruter; seed og setup-audit løfter trust-indholdet.
- Standardscaffoldet `website-corporate` seeder nu substantielle About-, Contact- og Privacy-ankre (mindst 500 rensede tegn og uden placeholder-sprog); setup-auditten kræver fortsat ejerens rigtige virksomhedsdata.
- Homepage understøtter `Accept: text/markdown` med korrekt `Vary`; ukendte markdown-paths returnerer rigtig 404 med recovery-links.
- `llms.txt` forklarer præcist, hvornår sitet bør bruges, og annoncerer ikke ACP/køb eller driftsadgang uden aktivering/auth.
- Deploy-verifikation prober fem AI user-agents og de nye discovery-kontrakter.

### Sikkerhedsmodel

- Public: kun publiceret katalog/sideindhold, read-only, fælles per-IP budget.
- Authenticated: discovery filtreres efter key-scopes, og hvert kald håndhæves igen af `invokeTool` mod de samme scopes (defence in depth).
- Ingen OAuth, ACP, WebMCP eller agentbetaling er slået til for scoreformål.
- Anonym produktsøgning bruger deterministisk leksikalsk søgning og udløser ikke en betalt embedding-provider.

### Verifikation

- `pnpm lint`: grøn (kun 7 allerede eksisterende warnings)
- `pnpm typecheck`: grøn
- `pnpm test`: 245 filer, 2.548 passed, 2 eksisterende skipped
- `pnpm build`: grøn på Next.js 16.3.0
- `pnpm test:e2e`: 4/4 grønne
- `pnpm audit:site-profile`: grøn
- Beskyttet Vercel-preview: homepage, About, Privacy, Contact, legacy `/info/about`, sitemap og developer-portal svarer 200.
- Preview-kontrakter: canonical/hreflang/OG bruger `https://demo.cartwright.app`; OpenAPI 3.1 har 88 konkrete paths, 88 unikke operation IDs og en substantiel beskrivelse på hver operation samt konkrete public response-skemaer, MIT metadata og korrekt security. Redoclys recommended-validator passerer uden warnings.
- Preview-metadata: `/da` har `lang="da"`, canonical `https://demo.cartwright.app/da`, `og:type=website` samt både Open Graph- og Twitter-billede på `https://demo.cartwright.app/opengraph-image`; billedruten svarer 200 med `image/png` (1.200 × 630).
- Preview uden JavaScript: den rå HTML indeholder 2.981 synlige teksttegn og et sammenhængende overskriftshierarki med 1 H1, 8 H2 og 12 H3.
- Structured-data-regression: rene builders og fire kontrakttests pin'er WebSite, Product, enkelt/Aggregate Offer med fragt og returret, BreadcrumbList og FAQPage. Den nuværende offentlige webshop-demo emitterer allerede Product, Offer og Breadcrumb på `/da/product/colombia-supremo`; samme runtime-probe gentages efter merge på den nye commit.
- Preview-sikkerhed: anonym MCP viser præcis fem allowlistede tools med input/output-schema, read-only annotations og structured output samt tre læsbare read-only resources med korrekt MIME; authenticated discovery er regressionstestet med både smalle og fulde scopes; legacy `{args:{…}}` virker; ugyldig Bearer og private REST-kald giver 401 `application/problem+json`.
- Preview-agentadgang: ChatGPT-User, ClaudeBot, Google-Extended, DeepSeekBot og ora-agent svarer alle 200 gennem den autentificerede preview-probe.
- Preview-discovery: forsiden linker direkte til den locale-aware developer-portal; alle tre MCP server-card paths er ens, serverkort og handshake rapporterer version `1.0.0`, og alle interne links i `llms.txt` resolver (200 eller korrekt locale-redirect).
- Preview-portabilitet: RFC 9727 API-kataloget linker REST/OpenAPI/docs/Agent Skills; Agent Skills 0.2.0-indexets SHA-256 matcher de faktisk serverede `SKILL.md`-bytes, og begge integritetsfiler er `no-store` for at undgå uafhængig CDN-drift.
- Preview-recovery: HTML/markdown negotiation, `Vary: Accept, Accept-Encoding`, rigtig markdown-404 og rate-limit headers (inkl. ikke-nul `RateLimit-Reset`) er grønne. Alle fem AI user-agents svarer 200. Ingen error- eller 500-runtime-logs efter smoken.
- Seneste preview-smoke på commit `1f98b4c`: `/da/contact` har canonical `https://demo.cartwright.app/da/contact`; MCP-handshake viser kun de fem public tools og tre public resources; OpenAPI har 88 paths/operation IDs med anonym security kun på allowlisten og Bearer-security på private operationer.

### Scaffold-profiler

- Den publicerede generator `create-cartwright@2.7.7` hentede branch-head med `--ref feat/agentic-readiness` og materialiserede `site`, `light` og `full` i rene temp-mapper.
- Alle tre profiler passerer `pnpm install --frozen-lockfile`, `pnpm typecheck` og `pnpm build` på commit `1f98b4c` og indeholder de fælles metadata-/JSON-LD-helpers. `light` og `full` indeholder desuden den scope-filtrerede MCP-bridge.
- `site` annoncerer ikke MCP, REST, OpenAPI eller developer-portalen, fordi de tilhørende ruter er fjernet. Runtime-smoke bekræfter ægte `404` for `/openapi.json`, `/api/mcp` og `/{locale}/developers`; markdown-404 linker kun til interfaces, profilen faktisk har.
- `light` og `full` beholder MCP, REST, OpenAPI og developer-portalen og bygger med de samme fork-sikre locale- og trust-audits.
- Profilernes eksisterende import-audit er uændret mod `origin/main`: `site` er lukket; `light` har 76 og `full` 24 allerede eksisterende modul-importlæk efter normalisering af genereret Prisma-kode. Det er separat modulgrænse-gæld, ikke en regression fra denne branch.
- Generatoren viser tre ikke-fatale drift-advarsler: favicon-patchens gamle farveankre og de danske/engelske `SaaSHome.cartwrightDesc2`-ankre findes ikke længere; `light` forsøger desuden at prune lockfile-importers for `@ai-sdk/openai` og `ts-node`, som ikke findes. Scaffolds bygger alligevel, men CLI-ankrene bør opdateres i en særskilt `create-cartwright`-release.

### Deploy og resterende gates

- Branch: `feat/agentic-readiness`
- PR: https://github.com/Teloz1870/cartwright-template/pull/1
- Verificeret deploy-commit: `1f98b4c109887b4c551e8340b2366a4c3dcf8e11`
- Beskyttet PR-preview: https://demo-cartwright-o0r1y8qev-teloz-s-projects.vercel.app
- Vercel deployment: `dpl_5u3Wgo7xN17qEkajYyvxeEBikpUV`
- Vercel-inspektør: https://vercel.com/teloz-s-projects/demo-cartwright/5u3Wgo7xN17qEkajYyvxeEBikpUV
- Nyt offentligt score: må først udfyldes efter stabil produktion og et frisk scan
- Eksterne gaps, der ikke løses alene i templaten: WAF/bot-regler og brand-indexering. Ændr kun WAF efter en reproducerbar produktionsblokering.
- Demoens nuværende CMS-Privacy-side indeholder stadig den gamle formulering “sende din kaffe”. Ret denne publicerede demodata efter merge og før produktionens trust-smoke/Is Agentic-scan; template-defaulten og draft-beskyttelsen er allerede korrekte.
- Previewen er bevidst bag Vercel Deployment Protection. Et offentligt Is Agentic-scan her ville kun måle login-gaten og må derfor ikke bruges som score-evidens.

### Efter merge

1. Deploy den kendte merge-commit til `demo.cartwright.app` via det Git-forbundne Vercel-projekt.
2. Verificér homepage, PLP, PDP, cart/checkout, About, Privacy, Contact, `llms.txt`, OpenAPI, MCP og en ukendt 404-path i produktion.
3. Deploy samme kendte commit til Solbrillen-canary og gentag de kritiske storefront- og agent-prober.
4. Kør først derefter `npx is-agentic demo.cartwright.app/da`. Hvis scorekortet stadig viser det seks timer cachede baseline-snapshot, vent på et nyt snapshot.
5. Opdatér først score-claim og X-udkast, når scorekortets dato og deploy-evidens matcher.

## English

The branch makes the template honestly agent-ready: five anonymous read-only tools with per-IP throttling, scoped Bearer access for everything else, direct MCP input/output schemas and structured results, public MCP resources, complete server cards at modern and legacy discovery paths, an RFC 9727 API catalog, a digest-verified Agent Skill, generated OpenAPI 3.1, an SSR developer portal with a versioning/deprecation policy, complete Problem Details across the agent-facing REST/discovery surface, runtime canonical/hreflang, complete and authority-linked Organization fields, stable trust routes, substantive default trust seeds, markdown negotiation and recoverable markdown 404s.

The security boundary is intentionally narrow: drafts, customers, orders, checkout, administration and every write remain authenticated. Authenticated MCP discovery is also least-privilege: a key only sees tools covered by its own scopes, with the same scopes enforced again at invocation. Anonymous product search cannot invoke a paid embedding provider. No OAuth, ACP, WebMCP or agent payment capability is enabled merely to improve a score.

### Validation and deployment

- Baseline: 52/100 at https://is-agentic.com/scan/demo.cartwright.app/da, scanned 2026-08-22 18:46:13 UTC. Replace it only with a fresh public production scorecard, including scan date and link.
- Pull request: https://github.com/Teloz1870/cartwright-template/pull/1
- Verified code commit: `1f98b4c109887b4c551e8340b2366a4c3dcf8e11`
- Protected preview: https://demo-cartwright-o0r1y8qev-teloz-s-projects.vercel.app (`dpl_5u3Wgo7xN17qEkajYyvxeEBikpUV`)
- Local gates: lint has zero errors, typecheck and build pass, 2,548 unit/contract tests pass (2 pre-existing skips), and Playwright is 4/4. Clean npm scaffolds of the same branch-head pass frozen install, typecheck and production build for `site`, `light` and `full`; all three contain the shared metadata/JSON-LD helpers.
- Structured-data regression: four contract tests pin WebSite, Product, single/Aggregate Offer merchant data, BreadcrumbList and FAQPage. The current public commerce demo still emits Product, Offer and Breadcrumb in raw PDP HTML; re-probe this after the branch is merged and deployed.
- Preview gates: all five crawler user agents return 200; the homepage links directly to localized developer docs; all three server-card paths, typed/annotated MCP tools, scope-filtered authenticated discovery, structured results, readable resources, RFC 9727 catalog, digest-matching Agent Skill, REST auth, Redocly-valid OpenAPI with descriptions for all 88 operations, canonical/hreflang, complete Open Graph/Twitter images, substantive no-JavaScript heading content, `llms.txt` links, markdown negotiation, rate-limit headers and 404 recovery pass; no error or 500 runtime logs were observed.
- Contract hardening in the verified commit includes locale-aware Contact metadata, normalized runtime discovery URLs, a complete Upstash 429 Problem Details/rate-header response, a shared REST/MCP limiter test and a published-only CMS trust resource with fallback defaults.
- Profile audit: `site` is closed and its runtime discovery is capability-accurate. The 76 `light` and 24 `full` leaks are unchanged from `origin/main`, so they are separate pre-existing module-boundary debt rather than this branch's regression. The published CLI still emits non-fatal stale patch-anchor warnings; update those anchors in the next CLI release.

### Remaining release gates

After review and merge, replace the stale coffee wording in the demo's published Privacy CMS content, deploy the known merge commit to `demo.cartwright.app`, run the production storefront/agent smoke, deploy the same commit to the Solbrillen canary, and only then run `npx is-agentic demo.cartwright.app/da`. Do not publish the score or the X draft while the public scorecard is stale or points at another deployment.
