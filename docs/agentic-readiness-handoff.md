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
- `pnpm test`: 238 filer, 2.510 passed, 2 eksisterende skipped
- `pnpm build`: grøn på Next.js 16.3.0
- `pnpm test:e2e`: 3/3 grønne
- `pnpm audit:site-profile`: grøn
- Lokal deploy-smoke: discovery-ruter, fem AI-agenter, markdown, OpenAPI, MCP, REST-auth og 404 grønne

### Deploy og resterende gates

- Branch: `feat/agentic-readiness`
- Deploy-commit: udfyldes efter push
- PR-preview: udfyldes efter Git/Vercel-preview
- Nyt offentligt score: må først udfyldes efter stabil produktion og et frisk scan
- Eksterne gaps, der ikke løses alene i templaten: WAF/bot-regler og brand-indexering. Ændr kun WAF efter en reproducerbar produktionsblokering.

## English

The branch makes the template honestly agent-ready: five anonymous read-only tools with per-IP throttling, scoped Bearer access for everything else, direct MCP schemas, public MCP resources, generated OpenAPI 3.1, an SSR developer portal, problem details, runtime canonical/hreflang, complete Organization fields, stable trust routes, markdown negotiation and recoverable markdown 404s.

The security boundary is intentionally narrow: drafts, customers, orders, checkout, administration and every write remain authenticated. Anonymous product search cannot invoke a paid embedding provider. No OAuth, ACP, WebMCP or agent payment capability is enabled merely to improve a score.

The verified baseline is 52/100 from 2026-08-22 18:46:13 UTC. Replace it only with a fresh public production scorecard, including date and link. Local validation is green as listed above; preview deploy, production canary checks and the public rescan remain release gates.
