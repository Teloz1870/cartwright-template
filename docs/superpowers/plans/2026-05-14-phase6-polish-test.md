# solbrillen.dk — Fase 6: Polish & Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Færdiggøre solbrillen.dk: Playwright E2E-tests for kerneflows, pæne fejl-/404-sider, loading-tilstande, oprydning af de mindre ting reviews har flagget, og en opdateret README + `.env.example`.

**Architecture:** Next.js 16 App Router. Playwright tilføjes til E2E (Vitest dækker allerede 35 unit-tests). `app/not-found.tsx` + `app/error.tsx` + `loading.tsx`-filer giver pæne tilstande. Småfejl fra tidligere faser ryddes op.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Prisma 6, Vitest, Playwright.

**Forudsætning:** Fase 1-5 er merget til `main` — komplet webshop med storefront, kurv, checkout, konti og admin; 35 unit-tests grønne. Arbejd på ny branch `build/phase6-polish-test` (forgrenet fra `main`).

---

## Filstruktur (Fase 6)

| Fil | Ansvar |
|---|---|
| `playwright.config.ts` | Playwright-konfiguration (starter dev-server, baseURL) |
| `tests/e2e/shop.spec.ts` | E2E: browse → produkt → læg i kurv → checkout → bekræftelse |
| `tests/e2e/account.spec.ts` | E2E: opret konto → log ind → se ordrehistorik |
| `tests/e2e/admin.spec.ts` | E2E: admin-login → opret produkt → se det i storefront |
| `app/not-found.tsx` | Pæn global 404-side (retning B) |
| `app/error.tsx` | Global error boundary (retning B) |
| `app/produkter/loading.tsx` | Loading-tilstand for produktoversigt |
| `app/produkt/[slug]/loading.tsx` | Loading-tilstand for produktside |
| `app/kategori/[slug]/loading.tsx` | Loading-tilstand for kategoriside |
| `proxy.ts` | Omdøbt fra `middleware.ts` (Next.js 16-konvention) |
| `README.md` | Opdateret kørselsvejledning + fuldt feature-overblik |
| `.env.example` | Skabelon for miljøvariabler |
| diverse | Småfejl-fixes (se Task 4) |

---

### Task 1: Playwright-opsætning + E2E happy-path-tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/shop.spec.ts`
- Create: `tests/e2e/account.spec.ts`
- Create: `tests/e2e/admin.spec.ts`
- Modify: `package.json` (tilføj `test:e2e`-script), `.gitignore` (tilføj Playwright-output: `/test-results/`, `/playwright-report/`, `/.playwright/`)
- Modify: `vitest.config.ts` HVIS nødvendigt (sørg for at Vitest IKKE forsøger at køre `tests/e2e/**` — Vitest's `include` er allerede `["tests/**/*.test.ts"]` og Playwright-filer hedder `*.spec.ts`, så de overlapper ikke; men verificér og ekskludér eksplicit hvis nødvendigt)

**Step 1: Installér Playwright**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm install -D @playwright/test && npx playwright install chromium` (kun chromium-browseren — hold det let).

**Step 2: `playwright.config.ts`**

Konfigurér: `testDir: "./tests/e2e"`, `baseURL: "http://localhost:3000"`, en `webServer`-blok der kører `npm run dev` (eller `npm run build && npm run start` — vælg `npm run dev`, simplest; `reuseExistingServer: !process.env.CI`, `url: "http://localhost:3000"`, rimelig `timeout`). Kun `chromium`-projekt. `fullyParallel: false` (testene deler én DB — kør serielt for at undgå race conditions). Rimelige retries/timeout.

> **VIGTIGT om DB-tilstand:** E2E-testene kører mod den rigtige SQLite-dev-DB. For at de er pålidelige skal DB'en være seeded. Tilføj i `playwright.config.ts` en `globalSetup`-fil ELLER dokumentér at `npx prisma migrate deploy && npx prisma db seed` skal køres før `npm run test:e2e`. **Vælg:** lav en `tests/e2e/global-setup.ts` der kører seed-scriptet programmatisk (eller via `execSync("npx prisma db seed")`) før testene — så DB'en altid er i kendt tilstand. Pointér `globalSetup` til den i config'en.

**Step 3: `tests/e2e/shop.spec.ts`** — gæste-købsflow:
- Gå til `/`. Forvent hero-tekst synlig.
- Naviger til `/produkter`. Forvent at produkter vises (mindst ét produktkort).
- Klik ind på et produkt (eller gå direkte til en kendt seeded slug — fx via at klikke første produktkort). Forvent produktside med "Læg i kurv"-knap.
- Klik "Læg i kurv". Forvent at kurv-badget i headeren stiger til "1" (eller naviger til `/kurv` og forvent én linje).
- Gå til `/kurv` → klik "Gå til checkout".
- På `/checkout`: udfyld leveringsformularen (navn, email, adresse, postnr 4 cifre, by). Klik "Gennemfør køb".
- Forvent redirect til `/ordre/...` med "Tak for din ordre!"-tekst.

**Step 4: `tests/e2e/account.spec.ts`** — konto-flow:
- Gå til `/konto/opret`. Udfyld navn, en UNIK email (brug `e2e-${Date.now()}@example.com` så testen kan køres flere gange), password (≥8 tegn). Submit.
- Forvent redirect til `/konto/login` (evt. med `?oprettet=1`).
- Log ind med samme email+password. Forvent at lande på `/konto` med "Min konto"-tekst.
- Naviger til `/konto/ordrer`. Forvent siden loader (overskrift "Mine ordrer" — tom-tilstand er fint, da denne nye bruger ingen ordrer har).

**Step 5: `tests/e2e/admin.spec.ts`** — admin-flow:
- Gå til `/konto/login`. Log ind som admin: `admin@solbrillen.dk` / `admin1234` (fra seed).
- Naviger til `/admin`. Forvent "Dashboard"-overskrift.
- Gå til `/admin/produkter/nyt`. Udfyld produktformularen med et unikt produkt (unikt slug, fx `e2e-test-${Date.now()}`, gyldig kategori valgt fra dropdown, pris, lager ≥1, alle påkrævede felter). Submit.
- Forvent redirect til `/admin/produkter` og at det nye produkt fremgår af listen.
- Naviger til `/produkt/<det-unikke-slug>` i storefronten. Forvent at produktet vises (navn synligt).

**Step 6: `package.json`** — tilføj `"test:e2e": "playwright test"`.

**Step 7: Verificér** — `npx tsc --noEmit` (clean), `npm test` (35 unit-tests stadig grønne), og `npm run test:e2e` (alle 3 E2E-specs grønne). Playwright starter selv dev-serveren via `webServer`-config.

**Step 8: Commit** — `git add -A && git commit -m "Add Playwright E2E tests for shop, account and admin flows"`

**Context:** Seed: 24 produkter, 5 kategorier, admin-bruger `admin@solbrillen.dk`/`admin1234`. Storefront-ruter: `/`, `/produkter`, `/produkt/[slug]`, `/kategori/[slug]`, `/kurv`, `/checkout`, `/ordre/[id]`. Konto: `/konto/opret`, `/konto/login`, `/konto`, `/konto/ordrer`. Admin: `/admin`, `/admin/produkter`, `/admin/produkter/nyt`. Brug robuste selektorer (tekst-baserede `getByRole`/`getByText`/`getByLabel` frem for skøre CSS-selektorer). Hvis et selektor-valg er usikkert pga. ukendt markup, foretræk `getByRole("heading", { name: ... })` og `getByRole("button"/"link", { name: ... })`.

---

### Task 2: Fejl- og 404-sider

**Files:**
- Create: `app/not-found.tsx`
- Create: `app/error.tsx`

**Kontrakt — `app/not-found.tsx`:** En global 404-side (Server Component). Retning B-stil: stor `font-black`-overskrift "Siden blev ikke fundet", en venlig dansk besked, og en `Button` (eller link) tilbage til `/` og til `/produkter`. Brug `sol-`-tokens.

**Kontrakt — `app/error.tsx`:** En global error boundary. Den SKAL være en Client Component (`"use client"` — Next.js-krav for `error.tsx`). Props: `{ error: Error & { digest?: string }; reset: () => void }`. Vis en venlig dansk fejlbesked ("Der opstede en uventet fejl"), en "Prøv igen"-knap der kalder `reset()`, og et link til `/`. Retning B-stil. Log `error` til konsollen i en `useEffect`.

**Steps:**
- [ ] Step 1: Skriv `app/not-found.tsx`.
- [ ] Step 2: Skriv `app/error.tsx`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add custom 404 and error boundary pages"`

---

### Task 3: Loading-tilstande

**Files:**
- Create: `app/produkter/loading.tsx`
- Create: `app/produkt/[slug]/loading.tsx`
- Create: `app/kategori/[slug]/loading.tsx`

**Kontrakt:** Hver `loading.tsx` er en simpel Server Component der viser en skelet-/loading-tilstand mens den tilsvarende side henter data. Hold dem enkle: et par grå/`sol-sun/20` skelet-blokke i layout der ligner sidens struktur (fx for produktoversigt: en række skelet-kort i et grid; for produktside: en stor billed-blok + tekstlinjer). Brug `animate-pulse`. Retning B-agtige farver. Ingen data-hentning, ingen props.

**Steps:**
- [ ] Step 1: Skriv de tre `loading.tsx`-filer.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 3: Commit — `git add -A && git commit -m "Add loading skeleton states for catalog pages"`

---

### Task 4: Oprydning af review-flaggede småfejl

**Files (modify):**
- `components/Header.tsx` — fjern `scrollbar-hide` (en no-op-klasse uden plugin) ELLER tilføj en rigtig CSS-regel; **vælg:** fjern klassen — en synlig scrollbar på mobil-nav er acceptabel.
- `components/RegisterForm.tsx` — tilføj `required` på `name`/`email`/`password`-inputtene (LoginForm har dem allerede; konsistens + a11y/autofill).
- `components/admin/DiscountCodeForm.tsx` — efter succesfuld `createDiscountCode`, tilføj `router.refresh()` (importér `useRouter`) så den nye kode straks vises i tabellen.
- `app/checkout/actions.ts` — wrap `mailer.sendOrderConfirmation(...)`-kaldet i sin egen try/catch (med `console.error`), så en mailer-fejl EFTER en succesfuld ordre-transaktion ikke får hele `placeOrder` til at returnere `{ ok: false }` (ordren ER jo oprettet). Ordren skal stadig returnere `{ ok: true, orderId }` selv hvis preview-mailen fejler.
- `middleware.ts` → omdøb til `proxy.ts`: Next.js 16 foretrækker `proxy.ts`. Brug `git mv middleware.ts proxy.ts` (indholdet er uændret — `export default auth(...)` og `config` virker ens i `proxy.ts`). Verificér at `npm run build` ikke længere viser deprecation-advarslen og at rute-beskyttelsen stadig virker.

**Steps:**
- [ ] Step 1: `components/Header.tsx` — fjern `scrollbar-hide`-klassen.
- [ ] Step 2: `components/RegisterForm.tsx` — tilføj `required` på de tre inputs.
- [ ] Step 3: `components/admin/DiscountCodeForm.tsx` — `router.refresh()` efter succes.
- [ ] Step 4: `app/checkout/actions.ts` — isolér mailer-kaldet i try/catch.
- [ ] Step 5: `git mv middleware.ts proxy.ts` (indhold uændret).
- [ ] Step 6: Verificér — `npx tsc --noEmit && npm run build && npm test`. Build skal lykkes; deprecation-advarslen om `middleware` skal være væk. Functional: start dev-server (baggrund, timeout), `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/konto` → stadig 307; `curl ... /admin` → stadig 307. Stop server.
- [ ] Step 7: Commit — `git add -A && git commit -m "Polish: fix review-flagged minor issues, rename middleware to proxy"`

---

### Task 5: README + `.env.example` + slut-verifikation

**Files:**
- Modify: `README.md`
- Create: `.env.example`

**Kontrakt — `README.md`:** Opdatér den eksisterende README til at afspejle hele den færdige shop. Indhold:
- Kort beskrivelse (komplet webshop — pitch/demo-prototype; Next.js full-stack, Prisma + SQLite, mock-betaling).
- **Kom i gang:** `npm install`, `cp .env.example .env`, `npx prisma migrate deploy`, `npx prisma db seed`, `npm run dev`, åbn http://localhost:3000.
- **Login:** admin `admin@solbrillen.dk` / `admin1234`; nævn at man kan oprette en kundekonto via `/konto/opret`.
- **Rabatkoder (demo):** `SOMMER10` (10%), `VELKOMST50` (50 kr).
- **Features:** kort punktliste — katalog med søgning/filtre, kurv, checkout med mock-betaling, kundekonti + ordrehistorik, admin-panel (produkter/ordrer/rabatkoder/kunder/e-mail-previews).
- **Test:** `npm test` (unit), `npm run test:e2e` (Playwright E2E).
- **Stack & struktur:** kort — Next.js 16 App Router, Prisma 6 + SQLite, Auth.js, Tailwind v4. Nævn at `docs/superpowers/` indeholder spec og faseplaner.
- **Status:** Alle 6 faser færdige.

**Kontrakt — `.env.example`:** En skabelon med de miljøvariabler appen bruger, med pladsholder-værdier og korte kommentarer:
```
# SQLite-database (fil-sti relativ til prisma/)
DATABASE_URL="file:./dev.db"

# Auth.js — generér en hemmelig nøgle med: npx auth secret
AUTH_SECRET="skift-mig-til-en-tilfældig-streng"
```

**Steps:**
- [ ] Step 1: Opdatér `README.md`.
- [ ] Step 2: Skriv `.env.example`.
- [ ] Step 3: Slut-verifikation — fra projektroden: `npx tsc --noEmit` (clean), `npm test` (35 grønne), `npm run build` (compiles), `npm run test:e2e` (3 E2E-specs grønne). Bekræft at `git status` er ren bortset fra de nye/ændrede filer.
- [ ] Step 4: Commit — `git add -A && git commit -m "Update README and add .env.example"`

---

## Self-Review

**1. Spec coverage (spec §9 test + §10 fase 6):** Vitest ✓ (allerede 35 tests fra fase 1-3). Playwright E2E ✓ (Task 1 — de tre flows fra spec §9: browse→kurv→checkout, opret→login→ordrehistorik, admin→opret produkt→se i storefront). Fejlsider ✓ (Task 2). E-mail-preview-visning ✓ (allerede leveret i Fase 5 `/admin/mails`). README med kørselsvejledning ✓ (Task 5). Design-finish ✓ (Task 3 loading-tilstande + Task 4 oprydning af visuelle/UX-småfejl).

**2. Placeholder scan:** Ingen placeholders. Alle Task 4-fixes er konkrete, navngivne ændringer.

**3. Type-konsistens:** Playwright-konfig og specs bruger `@playwright/test`. `app/error.tsx` bruger den krævede `{ error, reset }`-signatur. `proxy.ts` beholder `middleware.ts`' eksakte indhold (kun filnavn ændres). `router.refresh()` i `DiscountCodeForm` kræver `useRouter`-import — noteret i Task 4.

**4. Ambiguitet:** E2E-DB-tilstand — eksplicit håndteret med `globalSetup` der seeder (Task 1). Unikke testdata (timestamp-suffikser) så E2E kan køres gentagne gange — noteret i Task 1 Step 4-5. Vitest vs Playwright fil-overlap — `*.test.ts` vs `*.spec.ts` adskiller dem; eksplicit verificeret i Task 1.

**Afhængighedsrækkefølge:** Task 1-5 er stort set uafhængige (Task 1 E2E, Task 2 fejlsider, Task 3 loading, Task 4 fixes, Task 5 docs) — men Task 5's slut-verifikation kører `npm run test:e2e`, så Task 1 skal være færdig før Task 5. Sekventiel 1→5 passer. Task 4's `middleware`→`proxy`-omdøbning bør ske før Task 5's slut-build så advarslen er væk i den endelige verifikation.
