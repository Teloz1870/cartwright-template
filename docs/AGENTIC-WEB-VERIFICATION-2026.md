# Agentic-web 2026: kilde-verifikation af en ekstern teknologi-rapport

> **Companion til [`AI-NATIVE-ROADMAP-2026.md`](AI-NATIVE-ROADMAP-2026.md).** Hvor roadmappen
> definerer Cartwrights egne huller mod 2026-fronten, verificerer *dette* dokument en **ekstern**
> rapport (fra et andet AI-værktøj) påstand for påstand mod de citerede primærkilder + den faktiske
> kodebase. Formålet er at kunne videresende et korrekt grundlag — og at strippe de fabrikerede
> påstande før de når et planlægningsdokument.

## Kontekst

En ekstern "ultra-plan"-rapport (Gemini/Antigravity-stil) anbefalede fem teknologier til Cartwright:
**Just Bash**, **Modern Web Guidance (MWG)**, **ACP + UCP + WebMCP**, og **Tailwind v4 / Oxide**.
Rapporten blander ægte teknologier med **fabrikerede eller fejlattribuerede** påstande, og antager
systematisk at Cartwright mangler ting den allerede har shippet. Det er det samme mønster der udløste
roadmappen (en tidligere Gemini-chat der kaldte Cartwright "en tom frontend uden backend").

**Metode:** Hver påstand blev faktatjekket mod de citerede URL'er (web-fetch + søgning) og mappet mod
den faktiske kode med fil-referencer. Domme nedenfor er konservative: en påstand er kun "ægte" hvis en
primærkilde bekræfter den.

---

## Verifikations-matrix

| # | Påstand i rapporten | Dom | Virkeligheden (verificeret) | Cartwright-status |
|---|---|---|---|---|
| 1 | **Just Bash**: "in-memory bash-emulator i isoleret sandbox uden host-adgang + `onBeforeBashCall`-hook der screener/maskerer env-vars" | ⚠️ Ægte repo, **fabrikerede capabilities** | `vercel-labs/just-bash` er ægte (Apache-2.0), men **ikke VM-isoleret** — egen README: *"All execution happens without VM isolation"*. `onBeforeBashCall` ligger i et **andet** repo (`vercel-labs/bash-tool`) og **omskriver kun kommando-strenge** (fx `rm -rf` → `echo`). **Der findes ingen env-var-maskerings-hook.** Ægte isolation til utrusted kode = **Vercel Sandbox** (Firecracker microVMs, GA 2026-01-30), som just-bash's egen README henviser til. | Intet bash-eksekverings-behov; AI kalder kun typede, scopede tools. |
| 2 | **Antigravity CLI 2.0**: "Go-baseret CLI, async subagent-orkestrering; Gemini CLI udfases ind i den" | ⚠️ Ægte, **forkert versionsnummer** | Go-CLI'en der afløser Node-Gemini-CLI er reel (officiel Google Developers-blog + `google-gemini/gemini-cli` Discussion **#27274**, begge 2026-05-19). Gemini CLI stopper free + AI Pro/Ultra-requests **2026-06-18** (enterprise fortsætter; repo forbliver Apache-2.0). **Men CLI'en er v1.0.x — der findes ingen "CLI 2.0".** "2.0" er desktop-platformen (Antigravity 2.0, I/O 2026-05-19). | Kun agent-tooling (`GEMINI.md`, cc-gemini-plugin). En deadline at tracke, ikke engine-kode. |
| 3 | **Modern Web Guidance (MWG)**: "tvinger AI til moderne primitives; `npx modern-web-guidance`; TensorFlow.js semantisk søgning" | ✅ Ægte, **upræcis framing** | MWG er ægte (Google Chrome-teamet). Det er en **skill** (`SKILL.md`), ikke et tvangsværktøj — agenten kalder en CLI og *vælger* at følge guiderne. Invokering kræver subkommando + `@latest`: `npx modern-web-guidance@latest <search\|retrieve\|install>`. **TensorFlow.js MiniLM offline-embedding-søgning er korrekt** (verificeret on-disk: ~22MB tfjs graph-model + precomputed vektorer, cosine-similarity, ingen API-keys). | **Allerede adopteret** — refereret i `.claude/CLAUDE.md`, `AGENTS.md`, `cartwright-guidance`-skill, `internal-docs/modern-web-baseline.md`. |
| 4 | **ACP** (OpenAI+Stripe): "delegerede betalinger via *Delegate Payment API* + tokenisering; merchant beholder Merchant-of-Record" | ✅ Ægte, **navnefejl** | ACP er ægte (Apache-2.0, lanceret 2025-09-29). To specs: **Agentic Checkout Spec** + **Delegated Payment Spec** — **ikke** "Delegate Payment API". Stripes implementering hedder **Shared Payment Token (SPT)**. Tokenisering, single-use scoped token uden for PCI-scope, og MoR-påstanden er alle korrekte. Direkte Delegated-Payment-integration er kun for PSP'er / PCI DSS L1 — alle andre går via en PSP (Stripe SPT). | **~90% bygget.** Hele checkout-session-lifecyclen findes; kun delegated-payment er stub. |
| 5 | **UCP / "Universal Cart"** (Google+Shopify): "standardiserer hele købsrejsen; gør shops søg-/købbare i Google" | ✅ Ægte & aktuel (reneste punkt) | UCP er en åben standard (**ucp.dev**, Apache-2.0, annonceret 2026-01-11), co-udviklet med Shopify/Etsy/Wayfair/Target/Walmart, **kompatibel med AP2/A2A/MCP** (ikke en erstatning). **"Universal Cart" er et separat Google-*produkt*** (2026-05-19) **bygget på** UCP+AP2 — ikke protokollen selv. Rapporten konflaterer produkt og standard. | **Delvist** — capability-profil findes (`app/.well-known/ucp/route.ts`); marts-2026-tilføjelser mangler. |
| 6 | **WebMCP** (Chrome 149): "bringer MCP-agenter i browseren; annotér HTML-forms; `allow=\"tools\"` Permissions-Policy" | ✅ Ægte, men **umoden** | WebMCP er ægte: W3C Web Machine Learning CG **Draft** (5. juni 2026 — *ikke* en standard). Chrome 149 origin trial + `allow="tools"` iframe-policy er bekræftet. **Men: live-API'et er `document.modelContext.registerTool()` — `navigator.modelContext` er deprecated i Chrome 150.** Chrome-only, origin-trial, single-vendor. | Ikke bygget. Stærkt konceptuelt fit (samme mønster som `mcpPublic` + tool-registry). |
| 7 | **Tailwind v4 / Oxide**: "Rust-engine, 8-10× hurtigere (~800ms→100ms), `@theme` afløser config, *npx create-cartwright migrate*" | ✅ Ægte, **fabrikerede detaljer** | Tailwind v4 GA, Rust "Oxide"-engine, `@theme` CSS-first config og native container-queries er alt ægte. **Men: det officielle migrerings-værktøj er `npx @tailwindcss/upgrade`** (Node 20+) — **"npx create-cartwright migrate" er opdigtet** (konflaterer Cartwrights scaffolder med Tailwinds codemod). Perf-tallene (8-10× / 800ms→100ms full builds) matcher **ikke** Tailwinds officielle tal (full ~3.5-5×; de store multiplikatorer gælder *inkrementelle* rebuilds). Browser-baseline: Safari 16.4+/Chrome 111+/Firefox 128+. | **Allerede på v4.3.0** med `@theme` CSS-first i alle `themes/*.css`. Migrerings-præmissen er moot. |

---

## ❌ Fabrikations-ledger — byg IKKE på disse

Disse er entydigt forkerte. Strip dem fra ethvert planlægningsdokument:

1. **`just-bash` "env-var-maskerende `onBeforeBashCall`-hook"** — findes ikke. Hooken er i et andet repo (`bash-tool`) og omskriver kun kommando-strenge; der er **ingen** env-var-screening/maskering nogen steder.
2. **`just-bash` "isoleret sandbox uden host-adgang"** — overdrevet til falsk (ingen VM-isolation). Til utrusted kode: **Vercel Sandbox**.
3. **"Antigravity CLI 2.0"** — versionsfabrikation; CLI'en er v1.0.x. "2.0" = desktop-platformen.
4. **"Delegate Payment API"** — navnefabrikation. Korrekt: **"Delegated Payment Spec"** / Stripe **"Shared Payment Token"**.
5. **"npx create-cartwright migrate"** (Tailwind) — opdigtet. Korrekt: `npx @tailwindcss/upgrade`.
6. **Tailwind "8-10× / 800ms→100ms full builds"** — forkerte tal (sporet til en tredjepartsblog, ikke Tailwind-officielt).
7. **MWG "tvinger AI" / bare `npx modern-web-guidance`** — misframing; det er en opt-in skill, og invokering kræver subkommando + `@latest`.

**Uverificerbare / lavkvalitets-citerede kilder** rapporten lænede sig på: `locus-technologies/agentic-commerce-protocol-demo` (ureachable), `dorahacks.io/buidl/43258` (HTTP 405, ikke en CSS-autoritet), `firecrawl.dev/blog/ai-agent-sandbox` (nævner aldrig just-bash — fejl-citeret).

---

## Hvad Cartwright allerede har vs. de reelle huller

På protokol-laget (MCP/ACP/UCP/A2A) er Cartwright **foran** WooCommerce/Medusa og på niveau med
Shopify/Your Next Store. Fra kodebase-gennemgangen:

| Kapabilitet | Status | Fil-reference |
|---|---|---|
| MCP-server (37+ tools, Streamable HTTP, Bearer-auth, 34 scopes) | ✅ Har | `app/api/mcp/route.ts`, `lib/tools/registry.ts`, `app/.well-known/mcp.json/route.ts` |
| ACP checkout-session-lifecycle (create/update/retrieve/cancel) | ✅ Har | `app/api/acp/v1/checkout_sessions/**`, `lib/acp/index.ts` |
| **ACP delegated-payment (SPT-charge)** | ❌ **Reelt hul** | `lib/acp/complete.ts` — `chargeViaSharedPaymentToken()` kaster `payment_not_wired`. **Højest-værdi-build.** Se roadmappens **Hul C** + `docs/HUL-C-ACP-COMPLETION.md`. |
| A2A: signed Agent Card (ed25519), negotiate, escrow/PoTE, AgenticJWT | ✅ Har (bleeding edge) | `lib/a2a/`, `app/api/agent-card/route.ts`, `app/api/negotiate/route.ts`, `app/api/escrow/verify/route.ts`, `lib/guardian/middleware.ts` |
| UCP capability-profil | ✅ Har | `app/.well-known/ucp/route.ts` |
| **UCP marts-2026-modenhed** (cross-merchant identity-linking + `g:native_commerce` i feed) | ❌ **Reelt hul** | Roadmappens **Hul D**. |
| Tailwind v4.3.0 (CSS-first `@theme`) | ✅ Har | `postcss.config.mjs`, `app/globals.css`, `themes/*.css` |
| Modern Web Guidance + cartwright-guidance skills | ✅ Har | `.claude/skills/cartwright-guidance/SKILL.md`, `internal-docs/modern-web-baseline.md` |
| Stripe (webhooks, idempotens, refunds, multi-currency FX-snapshot) | ✅ Har | `app/api/webhook/stripe/route.ts`, `lib/stripe.ts`, `lib/orders/create.ts`, `lib/money.ts` |
| WebMCP (in-browser agent-tools) | ❌ Ikke bygget (umoden teknologi) | — |

**Konklusion:** Af rapportens fem områder er to (Tailwind v4, MWG) **allerede shippet**, ét (Just Bash)
hviler på en forkert sikkerhedsmodel og er ikke nødvendigt, og de reelle muligheder er **ACP-completion**
(næsten færdig) og **UCP-modenhed** (delvist) — præcis roadmappens Hul C og Hul D. WebMCP er ægte men
origin-trial-umoden: et default-off staging-eksperiment, ikke en produktions-afhængighed.

---

## Real-men-umoden (adoptér med forsigtighed)

- **WebMCP** — kun origin-trial (Chrome 149), W3C-draft, single-vendor, API-namespace ændrede sig lige
  (`navigator.` → `document.modelContext`). Byg bag en default-off flag som staging-eksperiment; **hold
  det af 3-canary-mosaikken** indtil spec'en stabiliserer og en anden browser signalerer intent.
- **Just Bash / agent-bash-eksekvering** — ikke på roadmappen; intet behov i dag. *Hvis*
  agent-marketplace-mode en dag skal køre tredjepartskode, er det korrekte valg **Vercel Sandbox**
  (Firecracker microVMs), ikke just-bash.

---

## Kilder (verificerede primær-URL'er)

- **Just Bash / Sandbox:** `github.com/vercel-labs/just-bash`, `github.com/vercel-labs/bash-tool`, `vercel.com/blog/vercel-sandbox-is-now-generally-available`
- **Antigravity CLI:** `github.com/google-gemini/gemini-cli/discussions/27274`, `developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/`
- **Modern Web Guidance:** `developer.chrome.com/docs/modern-web-guidance/get-started`, `github.com/GoogleChrome/modern-web-guidance`
- **ACP:** `developers.openai.com/commerce/specs/payment` (Delegated Payment Spec), `developers.openai.com/commerce/specs/checkout`, `github.com/agentic-commerce-protocol/agentic-commerce-protocol`, `docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens`
- **UCP:** `ucp.dev`, `developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/`, `developers.google.com/merchant/ucp`, `blog.google/products-and-platforms/products/shopping/google-shopping-cart/` (Universal Cart-produkt)
- **WebMCP:** `developer.chrome.com/docs/ai/webmcp`, `developer.chrome.com/docs/ai/webmcp/imperative-api` (namespace-deprecation), `webmachinelearning.github.io/webmcp/`
- **Tailwind v4:** `tailwindcss.com/blog/tailwindcss-v4`, `tailwindcss.com/docs/upgrade-guide` (`npx @tailwindcss/upgrade`)

---

*Verificeret 2026-06-06 mod kodebase på `feat/agentic-web-2026` (afledt af `main` @ v0.24.x).
Build-sekvensen for de reelle punkter (ACP / UCP / WebMCP / MWG) lever i
[`AI-NATIVE-ROADMAP-2026.md`](AI-NATIVE-ROADMAP-2026.md) og den tilhørende implementeringsplan.*
