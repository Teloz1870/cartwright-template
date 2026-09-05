# Cartwright → Best-in-Class AI-Native Commerce: Roadmap 2026

## Context

**Hvorfor dette dokument:** Målet er at positionere Cartwright som best-in-class for AI-native open-source commerce — med den nyeste viden og tilgang. Udløst af en Gemini-chat hvor Gemini gentagne gange gættede forkert om Cartwright (kaldte den en "tom frontend uden backend", foreslog at "tilføje fragt-API'er" osv.). En faktisk kodebase-gennemgang (v0.21.0) viser det modsatte: Cartwright er allerede et af de mest komplette agentic-commerce-fundamenter i open-source Next.js — og hullerne mod 2026-fronten er færre og mere præcist placerede end førsteindtrykket antyder.

**Formålet med roadmappen:** Et sandt positionerings- + gap- + sekvens-dokument, så strategien står på skrift før implementering. Denne fase leverer kun dokumentet — ingen feature-kode.

> **Kilde-verifikation:** Eksterne 2026-front-claims (Just Bash, MWG, ACP/UCP/WebMCP, Tailwind v4) er faktatjekket påstand-for-påstand mod primærkilder + kode i [`AGENTIC-WEB-VERIFICATION-2026.md`](AGENTIC-WEB-VERIFICATION-2026.md). Brug den til at skelne ægte teknologi fra de gentagne Gemini-fabrikationer (fx "Delegate Payment API", "Antigravity CLI 2.0", just-bash env-var-maskering) — og til at bekræfte at Hul C (ACP-completion) og Hul D (UCP-modenhed) nedenfor er de reelle muligheder.

## Verifikation af kodebase-påstande

**Alle "har/mangler"-statusser i dette dokument er tjekket mod faktisk v0.21.0-kode med fil-referencer** — det er hele pointen vs. Gemini-gættene. Hver reference kan klikkes og bekræftes. Centrale verifikationer:

- ACP session-lifecycle er reel og spec-formet (`lib/acp/index.ts`, `app/api/acp/v1/checkout_sessions/**`) — kun *payment-completion* er stub.
- `app/api/acp/v1/checkout_sessions/[id]/complete/route.ts` returnerer eksplicit `501`: *"ACP checkout completion (payment) ships in Phase B."*
- `@ai-sdk/openai` ligger i `package.json` (`^3.0.65`) men har **0 brug** i koden.
- Produktsøgning bruger SQLite `contains` (LIKE) på to call-sites; `ProductEmbedding`-tabellen er ubrugt.
- `AIStylistPanel.tsx` mapper allerede tool-results → React-komponenter deterministisk.

---

## Del 1 — Hvor Cartwright FAKTISK står (verificeret, v0.21.0)

Cartwright shipper allerede størstedelen af det 2026-research kalder table-stakes for AI-native commerce — inkl. ting Medusa og WooCommerce stadig mangler:

| Kapabilitet | Status i kode | Fil-reference |
|---|---|---|
| MCP-server (45+ tools, Streamable HTTP, Bearer-auth, scoped) | ✅ | `app/api/mcp/route.ts`, `lib/tools/registry.ts` |
| Public tool-katalog + REST tool-execution | ✅ | `app/api/v1/tools/route.ts`, `app/api/v1/tools/[name]/route.ts` |
| **ACP checkout-session lifecycle** (create/update/retrieve/cancel, line-item-resolution, pricing, discounts, adresse-state-machine) | ✅ | `app/api/acp/v1/checkout_sessions/**`, `lib/acp/index.ts` |
| **ACP payment-completion** | ⚠️ stub (`501`) | `app/api/acp/v1/checkout_sessions/[id]/complete/route.ts` → se **Hul C** |
| Legacy hosted-URL fallback ("link ud" til Stripe-checkout) | ✅ (separat, ældre path) | `app/api/commerce/agent-checkout/route.ts` |
| ACP/Merchant catalog-feed | ✅ | `app/api/acp/feed/route.ts`, `app/feed/google.xml/route.ts` |
| UCP capability-profil | ✅ | `app/.well-known/ucp/route.ts` |
| A2A: signed Agent Card (ed25519), escrow, Proof-of-Task, AgenticJWT | ✅ | `app/api/agent-card/route.ts`, `app/api/negotiate/route.ts`, models `EscrowTransaction`/`PoTEProof`/`AgenticJWT` |
| llms.txt (dynamisk, feature-drevet) | ✅ | `app/llms.txt/route.ts` |
| JSON-LD struktureret data (Product/Offer/Org/FAQ/Breadcrumb) | ✅ | `components/JsonLd.tsx` |
| Gemini Live voice shopping (ephemeral tokens, tool-dispatch, caps) | ✅ | `lib/voice/client.ts`, `app/api/live/token/route.ts`, `app/api/live/tool-dispatch/route.ts` |
| Tool-results → React-komponenter i chat (deterministisk) | ✅ | `app/api/assistant/chat/route.ts`, `components/AIStylistPanel.tsx` → se **Hul B** |
| Provider-routing Anthropic + Ollama (lokal) m. capability-matrix | ✅ | `lib/ai/client.ts`, `lib/ai/settings.ts` |
| Stripe (webhooks, idempotens, refunds, subscriptions, MobilePay/Apple/Google Pay) | ✅ | `app/api/webhook/stripe/route.ts`, `lib/orders/create.ts` |
| Multi-currency m. FX-snapshot på ordre | ✅ | `lib/money.ts` (`convertMinor`, `Order.currency/fxRate`) |
| Full admin (HPOS-grade ordre-workspace, RMA, dropship, zones, media-library) | ✅ | `app/admin/*` |
| Confirmation-gates (plan-first), scope-RBAC, jailbreak-defense, unified audit | ✅ | `lib/confirmation-tokens.ts`, `lib/scopes.ts`, `lib/audit.ts` |
| GDPR (erasure, export, processor-registry), i18n (next-intl, hreflang) | ✅ | `lib/tools/*`, `i18n/routing.ts` |

**Stack:** Next.js 16.2, React 19.2, Tailwind 4.3, Prisma 7.8, SQLite/Turso (libSQL), Auth.js v5, Vercel AI SDK 6, MCP SDK 1.29, Stripe SDK 22 (API `2026-05-27.dahlia`).

**Konklusion:** Fortællingen "Cartwright mangler det andet" er forkert. På protokol-laget (MCP/ACP/UCP/A2A) er Cartwright foran WooCommerce og Medusa og på niveau med Your Next Store / Shopify — A2A-escrow/PoTE er bleeding edge som stort set ingen andre open-source-projekter har. ACP-session-API'et er reelt og spec-formet; kun selve betalings-completion mangler.

---

## Del 2 — 2026-fronten (hvad best-in-class kræver)

Fra standards-research (kilder i bunden). **[TS]** = table-stakes, **[D]** = differentiator.

- **[TS] ACP (OpenAI+Stripe)** — buy-in-ChatGPT. Kræver delegated payment via **Stripe Shared Payment Tokens (SPT)**, ikke kun en hosted checkout-URL. Live på ChatGPT (900M ugentlige brugere), Etsy, 1M+ Shopify-merchants.
- **[TS] UCP (Google+Shopify)** — buy-in-Gemini/Google Shopping. Kræver capability-profil + Catalog/Cart/Checkout-API + (marts 2026) identity-linking + `native_commerce`-attribut i Merchant Center.
- **[TS] MCP** — agent↔merchant RPC. 97M månedlige SDK-downloads. Upstream af alle protokoller.
- **[TS] Schema.org Product JSON-LD + real-time feed** — produkter uden struktureret data er usynlige for agenter.
- **[TS] Semantisk/vektor-søgning (hybrid)** — agenter rangerer på semantisk lighed; +8–25% konvertering. Produktionsstandard Q1 2026.
- **[TS] Conversational checkout** — multi-turn chat-køb. 4x konverterings-lift.
- **[TS] GEO** — synlighed/citering i ChatGPT/Gemini/Perplexity. Gartner: 25% af søgninger forbigår Google i 2026.
- **[D] Generative UI** — LLM streamer levende React-komponenter (produktkort, anbefalinger, layout). 15–20% adoption, på vej til table-stakes.
- **[D] AP2 / network-tokens (Visa Intelligent Commerce, Mastercard Agent Pay)** — håndteres typisk af processor (Stripe), ikke merchant-kode.
- **[D] MCP-UI** — rige interaktive UI-komponenter returneret *inde i* chatten (Shopify open-sourcede dette aug 2025).

---

## Del 3 — De faktiske huller (verificeret absent/stubbed)

Rangeret efter impact × hvor tæt på færdig:

### Hul A — Semantisk/vektor-søgning **[TS] · STUBBED · høj leverage**
- `ProductEmbedding`-tabel findes (`prisma/schema.prisma`: `productId, vectorJson, model, updatedAt`) men **ingen kode genererer eller søger embeddings**.
- Nuværende søgning er ren SQLite `contains` (LIKE) på **to call-sites**:
  - `app/api/products/search/route.ts:30-32` (det offentlige agent-endpoint)
  - `searchProducts` i `lib/tools/products.ts:88` (`:100-102`, registry-toolen)
- Deferred-decision-markør at fjerne: `lib/tools/registry.ts:34` ("for 24 produkter er fritekst-search rigeligt").
- **Impact:** Table-stakes; løfter både menneske- og agent-konvertering. **Effort:** Mellem — halvt bygget.
- **Skalering → Hul A-2:** TS-cosine-loftet (~<10k produkter) løftes af en opt-in
  Postgres/pgvector ANN-sti (HNSW) bag `DATABASE_DRIVER=postgres` — samme hybrid-
  ranking, men i databasen. Samtidig "Cartwright kører på Supabase"-demo. Se
  [HUL-A2-PGVECTOR.md](HUL-A2-PGVECTOR.md).

### Hul B — Generative UI (model-dirigeret) **[D→TS] · DELVIST · matcher ejer-interesse**
- Fundamentet er stærkere end "AI former kun data": `components/AIStylistPanel.tsx:362-528` renderer allerede tool-results som React-komponenter (`ProductGridInline`, cart-summary, plan/order-cards) via en deterministisk `toolName → komponent`-switch oven på `streamText().toUIMessageStreamResponse()` (`app/api/assistant/chat/route.ts:317-331`).
- **Det reelle hul:** model-*dirigeret* komponent-valg/komposition — ikke "byg fra nul". Arbejdet = løfte den eksisterende `renderToolResult`-switch til et **model-valgbart whitelistet komponent-sæt** AI må streame (ProductCard, ComparisonGrid, ColorPicker, CartSummary), aldrig vilkårlig JSX.
- Ejeren blev specifikt tændt af "lade en AI designe siden" i Gemini-chatten. Eksisterende byggesten: `lib/tools/genome.ts`, `lib/tools/design.ts` (layout get/set), `lib/ai/theme-generator.ts`. **Effort:** Mellem.

### Hul C — Ægte buy-in-ChatGPT (ACP payment-completion) **[TS] · ÉN ENDPOINT + WIRING**
- Re-scoped til reel størrelse: **session-API'et findes allerede** (create/update/retrieve/cancel i `lib/acp/index.ts`). Det manglende er præcist lokaliseret:
  - **(a)** Implementér `app/api/acp/v1/checkout_sessions/[id]/complete/route.ts` (i dag `501`) til at acceptere en **Stripe Shared Payment Token** i en PaymentIntent og oprette ordren via `lib/orders/create.ts`.
  - **(b)** Wire `@ai-sdk/openai` i `lib/ai/client.ts` routing + `MODEL_CAPABILITIES` (SDK ligger ubrugt; routing går i dag kun Anthropic→Ollama).
  - **(c)** Token-lifecycle-webhooks i `app/api/webhook/stripe/route.ts`.
- Legacy `app/api/commerce/agent-checkout/route.ts` (hosted-URL) markeres **deprecatable** når `complete` lander.
- **Impact:** Forskellen på "agent kan linke til din shop" og "kunden trykker køb *inde i ChatGPT*". **Effort:** Mellem (ét endpoint + provider-wiring, ikke from-scratch ACP), men gated på ekstern Stripe SPT-adgang + ChatGPT merchant-godkendelse.

### Hul D — UCP-modenhed **[TS-emerging] · DELVIST**
- Capability-profil findes (`app/.well-known/ucp/route.ts`), men marts-2026-tilføjelser mangler: identity-linking på tværs af merchants + `native_commerce`-attribut i Merchant Center-feed. **Effort:** Mellem.

### Hul E — Token-niveau cost-metering **[D] · ABSENT**
- Kun call-count-lofter (20 customer / 50 admin), ikke faktisk token/kroner-måling. `IntegrationSettings.aiUsageJson` findes men måler ikke pr-request tokens. **Effort:** Lav-mellem.

### Hul F — MCP-UI (rich in-chat UI) **[D] · ABSENT**
- MCP-tools returnerer kun struktureret data, ikke interaktive UI-komponenter i chatten. **Effort:** Mellem.

---

## Del 4 — Anbefalet sekvens

Princip: byg det der er **table-stakes OG tættest på færdigt** først (hurtig målbar gevinst), så differentiatorer der matcher ejerens vision.

1. **Hul A — Semantisk søgning** (table-stakes, halvt bygget) → quick win, måles direkte på konvertering.
2. **Hul B — Generative UI** (differentiator, matcher "AI designer siden"-visionen; udvider eksisterende switch) → den synlige "wow" + markedsførings-historie.
3. **Hul C — Ægte buy-in-ChatGPT** → *mindre lift end førsteindtrykket*: ét endpoint (`complete`) + provider-wiring, ikke en from-scratch ACP-build. Start onboarding-research parallelt; kod når Stripe SPT-adgang er bekræftet.
4. **Hul D + E + F** (modenhed/polish) → løbende.

Hver blok leveres som selvstændig PR med Gemini-review + Codex-implementering (per vant arbejdsdeling), bygget og integreret lokalt — ejeren reviewer og releaser selv.

---

## Del 5 — Per-hul implementeringsskitse (til senere PR'er)

**Hul A (semantisk søgning):**
- Embedding-generering: hook på `products.create/update` (`lib/tools/products.ts`) + batch-backfill-script. Model via eksisterende provider-routing (`lib/ai/client.ts`). Skriv til `ProductEmbedding.vectorJson`.
- Hybrid query: kombinér eksisterende `contains` (BM25-agtig) + cosine-similarity i TS (SQLite har ingen native vektor; ok for nuværende katalog-størrelse). Opdater **begge** call-sites: `app/api/products/search/route.ts` + `searchProducts` i `lib/tools/products.ts:88`. Fjern deferred-markøren i `registry.ts:34`.
- Verifikation: seed katalog, kør semantiske queries, bekræft relevans-løft vs `contains`-baseline; Playwright-test på søge-endpoint.

**Hul B (generative UI):**
- Udvid den eksisterende `renderToolResult`-switch i `AIStylistPanel.tsx` til et hvidlistet, model-valgbart komponent-sæt streamet via AI SDK oven på `streamText` i `app/api/assistant/chat/route.ts` — aldrig vilkårlig JSX.
- Udvid evt. `lib/tools/design.ts` så AI kan foreslå/anvende layout-sektioner live i studio.
- Verifikation: visuel QA ved flere viewport-bredder (kode-review fanger ikke render-fejl).

**Hul C (buy-in-ChatGPT):**
- Bekræft Stripe SPT-adgang + ChatGPT merchant-onboarding FØRST. Implementér `complete/route.ts` (501→SPT i PaymentIntent + ordre via `lib/orders/create.ts`). Wire `@ai-sdk/openai` i `lib/ai/client.ts` routing + capability-matrix. Token-lifecycle-webhooks i `app/api/webhook/stripe/route.ts`. Deprecér legacy `agent-checkout` når `complete` lander.
- Verifikation: ACP-spec-compliance mod `2026-04-17`; test-køb gennem en agent-klient.

**Hul D/E/F:** UCP identity-linking + `native_commerce` i feed; per-request token-metering i audit/`aiUsageJson`; MCP-UI-komponenter i MCP tool-responses.

---

## Del 6 — Positionering / narrativ (GEO + README + llms.txt)

For at "være den bedste i faget" skal lederskabet også *hævdes* maskinlæsbart:
- Opdatér `app/llms.txt/route.ts` + README så den fulde protokol-matrix (MCP/ACP/UCP/A2A/voice) er eksplicit — det er Cartwrights reelle differentiator vs YNS/Medusa/Woo.
- GEO: sikr Schema.org-dækning + feed-friskhed så Cartwright-demoshops citeres af ChatGPT/Gemini/Perplexity.
- Korrigér den udbredte (Gemini-agtige) misforståelse i positioneringen: Cartwright ER full-stack m. Prisma-backend og et reelt spec-formet ACP-session-API — ikke en tom frontend.

---

## Verifikation af denne fase

Denne fase leverer kun roadmap-dokumentet. "Done" = dokumentet er committet (draft-PR), ejeren har læst og godkendt sekvensen, og første implementeringsblok (anbefalet: **Hul A**) er valgt. Ingen kode/commits autonomt udover dette dokument — ejeren reviewer og releaser/merger selv.

## Kilder (udvalg)
OpenAI Instant Checkout/ACP-spec (`2026-04-17`); Stripe Shared Payment Tokens & Agentic Commerce Suite; Google UCP (developers.google.com/merchant/ucp) + AP2; MCP Roadmap 2026; Shopify MCP/MCP-UI; Your Next Store MCP; WooCommerce MCP v10.3; Vercel AI SDK 6 generative UI; vektor-/semantisk-søgning- og GEO-guides 2026.
