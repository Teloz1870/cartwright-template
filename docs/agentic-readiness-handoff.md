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
- MCP publicerer konkrete Zod-inputskemaer direkte og accepterer legacy `{args:{…}}` i én kompatibilitetsperiode.
- Read-only MCP-resourcer publicerer `llms.txt`, sitemap og offentlige trust-data.
- `/openapi.json` genereres som OpenAPI 3.1 fra registry'et; `/developers` dokumenterer MCP, REST, auth, scopes, limits og problem-details.
- Agent-API-fejl bruger `application/problem+json` med kode og løsningsforslag, mens `ok/error` beholdes midlertidigt.
- Runtime brand-URL driver canonical/hreflang. Organization JSON-LD indeholder legalName, supportkontakt og PostalAddress.
- `/about` og `/privacy` er stabile locale-ruter; seed og setup-audit løfter trust-indholdet.
- Homepage understøtter `Accept: text/markdown` med korrekt `Vary`; ukendte markdown-paths returnerer rigtig 404 med recovery-links.
- `llms.txt` forklarer præcist, hvornår sitet bør bruges, og annoncerer ikke ACP/køb eller driftsadgang uden aktivering/auth.
- Deploy-verifikation prober fem AI user-agents og de nye discovery-kontrakter.

### Sikkerhedsmodel

- Public: kun publiceret katalog/sideindhold, read-only, fælles per-IP budget.
- Authenticated: registry'et vises, men hvert kald håndhæves fortsat af `invokeTool` mod key-scopes.
- Ingen OAuth, ACP, WebMCP eller agentbetaling er slået til for scoreformål.
- Anonym produktsøgning bruger deterministisk leksikalsk søgning og udløser ikke en betalt embedding-provider.

### Verifikation

- `pnpm lint`: grøn (kun 7 allerede eksisterende warnings)
- `pnpm typecheck`: grøn
- `pnpm test`: 239 filer, 2.520 passed, 2 eksisterende skipped
- `pnpm build`: grøn på Next.js 16.3.0
- `pnpm test:e2e`: 3/3 grønne
- `pnpm audit:site-profile`: grøn
- Beskyttet Vercel-preview: homepage, About, Privacy, Contact, legacy `/info/about`, sitemap og developer-portal svarer 200.
- Preview-kontrakter: canonical/hreflang/OG bruger `https://demo.cartwright.app`; OpenAPI 3.1 har 88 konkrete paths, unikke operation IDs, konkrete public response-skemaer og korrekt security.
- Preview-sikkerhed: anonym MCP viser præcis fem allowlistede tools og tre read-only resources; legacy `{args:{…}}` virker; ugyldig Bearer og private REST-kald giver 401 `application/problem+json`.
- Preview-agentadgang: ChatGPT-User, ClaudeBot, Google-Extended, DeepSeekBot og ora-agent svarer alle 200 gennem den autentificerede preview-probe.
- Preview-recovery: HTML/markdown negotiation, `Vary: Accept, Accept-Encoding`, rigtig markdown-404 og rate-limit headers (inkl. ikke-nul `RateLimit-Reset`) er grønne. Ingen 500-runtime-logs efter smoken.

### Scaffold-profiler

- `site`: grøn og lukket uden importlæk på både `origin/main` og branchen.
- `light`: audit rapporterer 76 eksisterende modul-importlæk på både `origin/main` og branchen, når genereret Prisma-kode normaliseres væk.
- `full`: audit rapporterer 24 eksisterende modul-importlæk på både `origin/main` og branchen efter samme normalisering.
- Agentic-branchen introducerer dermed ingen profilregression. Den eksisterende `light`/`full`-gæld bør have sin egen modulgrænse-PR; et publiceret CLI-scaffold kan først endeligt røges mod denne kode efter merge/tag.

### Deploy og resterende gates

- Branch: `feat/agentic-readiness`
- PR: https://github.com/Teloz1870/cartwright-template/pull/1
- Verificeret deploy-commit: `358be22a936609208f054091bfd4200d3c434852`
- Beskyttet PR-preview: https://demo-cartwright-2z8yw43mo-teloz-s-projects.vercel.app
- Vercel deployment: `dpl_9kdvHeocnTJehzdKjmZzrNrqdSG9`
- Vercel-inspektør: https://vercel.com/teloz-s-projects/demo-cartwright/9kdvHeocnTJehzdKjmZzrNrqdSG9
- Nyt offentligt score: må først udfyldes efter stabil produktion og et frisk scan
- Eksterne gaps, der ikke løses alene i templaten: WAF/bot-regler og brand-indexering. Ændr kun WAF efter en reproducerbar produktionsblokering.
- Previewen er bevidst bag Vercel Deployment Protection. Et offentligt Is Agentic-scan her ville kun måle login-gaten og må derfor ikke bruges som score-evidens.

### Efter merge

1. Deploy den kendte merge-commit til `demo.cartwright.app` via det Git-forbundne Vercel-projekt.
2. Verificér homepage, PLP, PDP, cart/checkout, About, Privacy, Contact, `llms.txt`, OpenAPI, MCP og en ukendt 404-path i produktion.
3. Deploy samme kendte commit til Solbrillen-canary og gentag de kritiske storefront- og agent-prober.
4. Kør først derefter `npx is-agentic demo.cartwright.app/da`. Hvis scorekortet stadig viser det seks timer cachede baseline-snapshot, vent på et nyt snapshot.
5. Opdatér først score-claim og X-udkast, når scorekortets dato og deploy-evidens matcher.

## English

The branch makes the template honestly agent-ready: five anonymous read-only tools with per-IP throttling, scoped Bearer access for everything else, direct MCP schemas, public MCP resources, generated OpenAPI 3.1, an SSR developer portal, problem details, runtime canonical/hreflang, complete Organization fields, stable trust routes, markdown negotiation and recoverable markdown 404s.

The security boundary is intentionally narrow: drafts, customers, orders, checkout, administration and every write remain authenticated. Anonymous product search cannot invoke a paid embedding provider. No OAuth, ACP, WebMCP or agent payment capability is enabled merely to improve a score.

### Validation and deployment

- Baseline: 52/100 at https://is-agentic.com/scan/demo.cartwright.app/da, scanned 2026-08-22 18:46:13 UTC. Replace it only with a fresh public production scorecard, including scan date and link.
- Pull request: https://github.com/Teloz1870/cartwright-template/pull/1
- Verified code commit: `358be22a936609208f054091bfd4200d3c434852`
- Protected preview: https://demo-cartwright-2z8yw43mo-teloz-s-projects.vercel.app (`dpl_9kdvHeocnTJehzdKjmZzrNrqdSG9`)
- Local gates: lint has zero errors, typecheck and build pass, 2,520 unit/contract tests pass (2 pre-existing skips), and Playwright is 3/3.
- Preview gates: all five crawler user agents return 200; MCP, resources, REST auth, OpenAPI, canonical/hreflang, markdown negotiation, rate-limit headers and 404 recovery pass; no 500 runtime logs were observed.
- Profile audit: `site` is closed. The 76 `light` and 24 `full` leaks are unchanged from `origin/main`, so they are separate pre-existing module-boundary debt rather than this branch's regression.

### Remaining release gates

After review and merge, deploy the known merge commit to `demo.cartwright.app`, run the production storefront/agent smoke, deploy the same commit to the Solbrillen canary, and only then run `npx is-agentic demo.cartwright.app/da`. Do not publish the score or the X draft while the public scorecard is stale or points at another deployment.
