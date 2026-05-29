# solbrillen.dk — Fase 7: Indhold, Branding & Design-finish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lukke de sidste huller i webshoppen: admin-redigerbare indholdssider (Om os, Kontakt, FAQ + jura-sider), fuld kategori-administration med beskrivelser, et rigtigt logo + favicon, en overhalet header (rigtig søgeboks + mobil-menu) og footer, samt en systematisk design-finish.

**Architecture:** Next.js 16 App Router. To nye Prisma-modeller: `Page` (CMS-lite til indholdssider) og et `description`-felt på `Category`. Admin får to nye sektioner (Sider, Kategorier) der følger det eksisterende admin-mønster (`requireAdmin()` + server actions + tabel/formular). Offentlige indholdssider via én dynamisk route. Branding og header/footer er rene komponent-ændringer.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Prisma 6, Auth.js, Zod, Vitest, Playwright.

**Forudsætning:** Fase 1-6 + visuel overhaul er merget til `main` — komplet, visuelt poleret webshop. 35 unit-tests + 3 E2E grønne. Arbejd på ny branch `build/phase7-indhold-branding` (forgrenet fra `main`).

---

## Filstruktur (Fase 7)

| Fil | Ansvar |
|---|---|
| `prisma/schema.prisma` | Modificér: ny `Page`-model, `description String?` på `Category` |
| `prisma/seed.ts` | Modificér: seed 7 `Page`-rækker + 5 kategori-beskrivelser |
| `lib/validation.ts` | Modificér: `pageSchema`, `categorySchema` |
| `lib/content.ts` | `renderContentBlocks(body)` — ren funktion: plain-text body → struktureret blok-array (afsnit + `## `-underoverskrifter) |
| `app/admin/actions.ts` | Modificér: `createPage`/`updatePage`/`deletePage`, `createCategory`/`updateCategory`/`deleteCategory` |
| `app/admin/sider/page.tsx` + `nyt/` + `[id]/` | Admin: indholdsside-liste, opret, rediger |
| `app/admin/kategorier/page.tsx` + `nyt/` + `[id]/` | Admin: kategori-liste, opret, rediger |
| `components/admin/PageForm.tsx`, `CategoryForm.tsx`, `DeletePageButton.tsx`, `DeleteCategoryButton.tsx` | Admin client-komponenter |
| `app/admin/layout.tsx` | Modificér: tilføj "Sider" + "Kategorier" til admin-nav |
| `app/info/[slug]/page.tsx` | Offentlig indholdsside (renderer en `Page`) |
| `app/kategori/[slug]/page.tsx` | Modificér: vis kategori-beskrivelse under banneret |
| `components/Logo.tsx` | SVG-logo (solbrille-mærke + wordmark) |
| `app/icon.svg` | Favicon (Next.js auto-favicon) |
| `components/Header.tsx` | Modificér: brug `Logo`, rigtig søgeboks, mobil-menu |
| `components/SearchBox.tsx` | Client: søgeboks der navigerer til `/produkter?q=` |
| `components/MobileMenu.tsx` | Client: mobil burger-menu |
| `components/Footer.tsx` | Modificér: indholdsside-links, nyhedsbrev-felt, trust-række |
| `components/NewsletterSignup.tsx` | Client: nyhedsbrev-felt (mock-succes) |
| `tests/unit/content.test.ts` | Tests for `renderContentBlocks` |
| diverse storefront-filer | Design-finish-polering (Task 11) |
| `public/` | Slet scaffold-SVG'er (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) |

---

## Designnoter

- **Indholdssider er admin-redigerbare** via en `Page`-model. `body` gemmes som **ren tekst** (ingen HTML — undgår XSS). Den offentlige side renderer body via `renderContentBlocks`: blanke linjer adskiller afsnit, linjer der starter med `## ` bliver underoverskrifter. Enkelt, sikkert, nok til Om os/FAQ/jura.
- De 7 indholdssider (slug → titel): `om-os` → "Om os", `kontakt` → "Kontakt", `faq` → "Ofte stillede spørgsmål", `fragt-og-levering` → "Fragt & levering", `returret` → "Returret & bytte", `handelsbetingelser` → "Handelsbetingelser", `privatlivspolitik` → "Privatlivspolitik".
- **Kategori-admin** følger nøjagtigt det eksisterende produkt-admin-mønster (liste-tabel + opret/rediger-formular + slet-knap med FK-fejlhåndtering — en kategori med produkter kan ikke slettes).
- **To-lags beskyttelse** gælder fortsat: admin-sider kalder `requireAdmin()`, admin-actions kalder `requireAdmin()` først.
- Stil: visuel retning B (`sol-`-tokens, `font-black`). Admin er funktionel/tæt.

---

### Task 1: `Page`-model + `Category.description` + migration + seed

**Files:** Modificér `prisma/schema.prisma`, `prisma/seed.ts`.

- [ ] **Step 1:** Tilføj til `prisma/schema.prisma`: ny model
  ```prisma
  model Page {
    id        String   @id @default(cuid())
    slug      String   @unique
    title     String
    body      String
    updatedAt DateTime @updatedAt
  }
  ```
  og tilføj `description String?` til `Category`-modellen.
- [ ] **Step 2:** `npx prisma migrate dev --name pages-and-category-description`.
- [ ] **Step 3:** Modificér `prisma/seed.ts`: tilføj `description` til hvert af de 5 `CATEGORIES`-objekter (en kort, tasteful dansk sætning pr. kategori — fx Herre: "Klassiske og maskuline solbriller med stærk pasform."). Og tilføj seeding af de 7 `Page`-rækker med rigtig, tasteful dansk demo-tekst i `body` (brug `## `-underoverskrifter hvor det giver mening — især FAQ og jura-siderne; gør jura-teksten generisk men plausibel for en demo). Seed er idempotent (rydder via `deleteMany` — tilføj `prisma.page.deleteMany()` i oprydningen).
- [ ] **Step 4:** Kør `npx prisma db seed`, verificér: `sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Page; SELECT COUNT(*) FROM Category WHERE description IS NOT NULL;"` → 7 og 5.
- [ ] **Step 5:** `npx tsc --noEmit && npm run build`. Commit: `Add Page model and Category.description with seed data`.

---

### Task 2: `lib/content.ts` — `renderContentBlocks` (TDD)

**Files:** Create `lib/content.ts`, `tests/unit/content.test.ts`.

**Kontrakt:** `renderContentBlocks(body: string): ContentBlock[]` hvor `ContentBlock = { type: "heading"; text: string } | { type: "paragraph"; text: string }`. Body splittes på blanke linjer (`\n\n`); en blok hvis trimmede tekst starter med `## ` bliver `{ type: "heading", text: <uden "## "> }`, ellers `{ type: "paragraph", text: <trimmet, med enkelt-linjeskift bevaret> }`. Tomme blokke udelades.

- [ ] **Step 1:** Skriv `tests/unit/content.test.ts` — tests: tom streng → `[]`; ét afsnit → ét paragraph-blok; to afsnit adskilt af blank linje → to paragraph-blokke; `## Overskrift` → heading-blok; blandet heading + afsnit; whitespace-only blokke udelades. (Skriv ~6 konkrete `it()`-blokke med `expect(...).toEqual(...)`.)
- [ ] **Step 2:** Kør `npm test` → FAIL "Cannot find module '@/lib/content'".
- [ ] **Step 3:** Implementér `lib/content.ts`.
- [ ] **Step 4:** `npm test` → alle tests grønne (35 + de nye).
- [ ] **Step 5:** `npx tsc --noEmit`. Commit: `Add renderContentBlocks content helper with tests`.

---

### Task 3: Zod-skemaer for Page + Category

**Files:** Modificér `lib/validation.ts`.

- [ ] **Step 1:** Tilføj `pageSchema` (Zod): `slug` (min 2, regex `/^[a-z0-9-]+$/`), `title` (min 2), `body` (min 10) — danske fejlbeskeder. Eksportér `PageInput`.
- [ ] **Step 2:** Tilføj `categorySchema` (Zod): `name` (min 2), `slug` (min 2, regex `/^[a-z0-9-]+$/`), `description` (valgfri streng, må være tom). Eksportér `CategoryInput`. Bevar alle eksisterende skemaer.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build && npm test`. Commit: `Add page and category validation schemas`.

---

### Task 4: Admin server actions — Page + Category CRUD

**Files:** Modificér `app/admin/actions.ts`.

- [ ] **Step 1:** Tilføj (hver action kalder `requireAdmin()` først, try/catch, danske fejl, `{ ok: true ... } | { ok: false; error }`-retur, `revalidatePath`):
  - `createPage(formData)` / `updatePage(id, formData)` — parse med `pageSchema`; håndtér `P2002` (slug-dublet) → dansk fejl; `P2025` på update → "Siden blev ikke fundet". Revalidér `/admin/sider` og `/info/<slug>`.
  - `deletePage(id)` — `prisma.page.delete`; `P2025` → fejl. Revalidér `/admin/sider`.
  - `createCategory(formData)` / `updateCategory(id, formData)` — parse med `categorySchema`; `description`: tom streng → gem som `null` (eller tom — vælg `null` hvis tom). `P2002` (slug) → dansk fejl; `P2025` → "Kategorien blev ikke fundet". Revalidér `/admin/kategorier` + `/kategori/<slug>` + `/`.
  - `deleteCategory(id)` — `prisma.category.delete`; en kategori med produkter giver `P2003` (FK) → returnér "Kategorien kan ikke slettes, da den har produkter. Flyt produkterne først." `P2025` → fejl. Revalidér `/admin/kategorier`.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build`. Commit: `Add admin server actions for pages and categories`.

---

### Task 5: Admin — indholdsside-administration

**Files:** Create `components/admin/PageForm.tsx`, `components/admin/DeletePageButton.tsx`, `app/admin/sider/page.tsx`, `app/admin/sider/nyt/page.tsx`, `app/admin/sider/[id]/page.tsx`. Modificér `app/admin/layout.tsx`.

- [ ] **Step 1:** `PageForm.tsx` (`"use client"`) — props `{ page?: {id,slug,title,body} }`. Felter: `slug`, `title` (text), `body` (stor textarea). Input-`name`s = `slug`/`title`/`body`. Submit → `updatePage`/`createPage`, `useTransition`, ved succes `router.push("/admin/sider")`, ved fejl vis besked. Følg `ProductForm.tsx`-stilen.
- [ ] **Step 2:** `DeletePageButton.tsx` (`"use client"`) — som `DeleteProductButton.tsx`, kalder `deletePage`.
- [ ] **Step 3:** `app/admin/sider/page.tsx` — `requireAdmin()`, `prisma.page.findMany({ orderBy: { slug: "asc" } })`, tabel (Slug, Titel, Sidst opdateret, Handlinger: Rediger-link + `DeletePageButton`), "+ Ny side"-link.
- [ ] **Step 4:** `app/admin/sider/nyt/page.tsx` — `requireAdmin()`, overskrift + `<PageForm />`.
- [ ] **Step 5:** `app/admin/sider/[id]/page.tsx` — `requireAdmin()`, `params: Promise<{id}>`, `findUnique` + `notFound()`, `<PageForm page={...} />`.
- [ ] **Step 6:** Modificér `app/admin/layout.tsx` — tilføj `{ href: "/admin/sider", label: "Sider" }` til `navLinks`.
- [ ] **Step 7:** `npx tsc --noEmit && npm run build`. Commit: `Add page administration in admin`.

---

### Task 6: Admin — kategori-administration

**Files:** Create `components/admin/CategoryForm.tsx`, `components/admin/DeleteCategoryButton.tsx`, `app/admin/kategorier/page.tsx`, `app/admin/kategorier/nyt/page.tsx`, `app/admin/kategorier/[id]/page.tsx`. Modificér `app/admin/layout.tsx`.

- [ ] **Step 1:** `CategoryForm.tsx` (`"use client"`) — props `{ category?: {id,name,slug,description} }`. Felter: `name`, `slug` (text), `description` (textarea, valgfri). Input-`name`s matcher `categorySchema`. Submit → `updateCategory`/`createCategory`.
- [ ] **Step 2:** `DeleteCategoryButton.tsx` — som `DeleteProductButton.tsx`, kalder `deleteCategory`, viser FK-fejlbeskeden hvis kategorien har produkter.
- [ ] **Step 3:** `app/admin/kategorier/page.tsx` — `requireAdmin()`, `prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } })`, tabel (Navn, Slug, Antal produkter, Beskrivelse-uddrag, Handlinger), "+ Ny kategori"-link.
- [ ] **Step 4:** `app/admin/kategorier/nyt/page.tsx` + `[id]/page.tsx` — som side-pendanterne.
- [ ] **Step 5:** Modificér `app/admin/layout.tsx` — tilføj `{ href: "/admin/kategorier", label: "Kategorier" }` til `navLinks`.
- [ ] **Step 6:** `npx tsc --noEmit && npm run build`. Commit: `Add category administration in admin`.

---

### Task 7: Offentlig indholdsside + kategori-beskrivelse på kategorisiden

**Files:** Create `app/info/[slug]/page.tsx`. Modificér `app/kategori/[slug]/page.tsx`.

- [ ] **Step 1:** `app/info/[slug]/page.tsx` — `async` Server Component, `params: Promise<{slug}>` awaited + `decodeURIComponent`, `prisma.page.findUnique({ where: { slug } })`, `notFound()` hvis null. Render: en pæn side i retning B — `font-black` titel i et bånd/header, og `body` renderet via `renderContentBlocks` (`heading`-blokke som `<h2 font-black>`, `paragraph`-blokke som `<p>` med `whitespace-pre-line`). Læsbar `max-w-2xl`/`prose`-agtig kolonne. `generateMetadata` sætter titlen. Root `<div>`.
- [ ] **Step 2:** Modificér `app/kategori/[slug]/page.tsx` — hvis `category.description` findes, vis den som en kort introtekst lige under banner-headeren (over produktgriddet), i en pæn `max-w-2xl`-kolonne.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build`. Functional: start dev (baggrund, timeout), `curl -s -o /dev/null -w "%{http_code}"` på `/info/om-os` → 200, `/info/findes-ikke` → 404, `/kategori/herre` → 200. Stop server. Commit: `Add public content pages and category descriptions`.

---

### Task 8: Logo + favicon + scaffold-oprydning

**Files:** Create `components/Logo.tsx`, `app/icon.svg`. Slet `public/{next,vercel,file,globe,window}.svg`.

- [ ] **Step 1:** `components/Logo.tsx` — en React-komponent der renderer et SVG solbrille-mærke (to runde/firkantede "glas" forbundet af en bro — geometrisk, rent) ved siden af wordmarket "solbrillen.dk" i `font-black`. Props: `{ className?: string }`. Brug `currentColor` så den arver farve. Hold SVG'et enkelt og skarpt.
- [ ] **Step 2:** `app/icon.svg` — et lille, selvstændigt favicon-SVG (solbrille-mærket alene, på en `sol-accent`/`sol-ink`-baggrund eller transparent). Next.js 16 bruger automatisk `app/icon.svg` som favicon.
- [ ] **Step 3:** Slet de fem scaffold-SVG'er i `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) — de bruges ingen steder (verificér med `grep -r` først).
- [ ] **Step 4:** Tilføj `openGraph`/`icons` til `metadata` i `app/layout.tsx` hvis ikke til stede — som minimum `icons` peger Next.js selv på via `app/icon.svg`; tilføj en simpel `openGraph: { title, description }`.
- [ ] **Step 5:** `npx tsc --noEmit && npm run build`. Commit: `Add logo, favicon and remove scaffold assets`.

---

### Task 9: Header-overhaul — logo, søgeboks, mobil-menu

**Files:** Create `components/SearchBox.tsx`, `components/MobileMenu.tsx`. Modificér `components/Header.tsx`.

- [ ] **Step 1:** `SearchBox.tsx` (`"use client"`) — en kompakt søgeformular: et tekstinput + søge-ikon. Ved submit: `router.push("/produkter?q=" + encodeURIComponent(value))` (tom værdi → bare `/produkter`). Brug `useRouter`. Stil i retning B (pille-input).
- [ ] **Step 2:** `MobileMenu.tsx` (`"use client"`) — en burger-knap der toggler en mobil-overlay/panel med kategori-links + indholdsside-links + konto/kurv-links. Props: `{ categories: {name,slug}[] }`. `useState` til open/close. Kun synlig på små skærme (`md:hidden`).
- [ ] **Step 3:** Modificér `components/Header.tsx` — fortsat `async` Server Component: brug `<Logo />` i stedet for ren tekst; erstat "Søg"-linket med `<SearchBox />` (på desktop); tilføj `<MobileMenu categories={...} />` til small-screen. Behold kategori-nav på desktop, kurv-badge (`getCartCount`), og login-tilstand (`auth()`). Hold kategori-nav + søgeboks skjult på mobil (mobil-menuen dækker det). Bevar al eksisterende logik.
- [ ] **Step 4:** `npx tsc --noEmit && npm run build`. Functional: dev-server, `curl /produkter?q=solir` → 200. Commit: `Overhaul header with logo, search box and mobile menu`.

---

### Task 10: Footer-overhaul

**Files:** Create `components/NewsletterSignup.tsx`. Modificér `components/Footer.tsx`.

- [ ] **Step 1:** `NewsletterSignup.tsx` (`"use client"`) — et email-input + "Tilmeld"-knap. Ved submit (client-side): vis "Tak — du er tilmeldt!" og ryd feltet. Mock — ingen backend (det er en demo; noter det i en kommentar). Simpel email-validering før succes.
- [ ] **Step 2:** Modificér `components/Footer.tsx` — udvid til en rigtig footer med kolonner: (a) `<Logo />` + kort tagline, (b) "Shop"-kolonne med kategori-links + "Alle solbriller", (c) "Kundeservice"-kolonne med links til indholdssiderne (`/info/kontakt`, `/info/faq`, `/info/fragt-og-levering`, `/info/returret`), (d) "Virksomhed"-kolonne (`/info/om-os`, `/info/handelsbetingelser`, `/info/privatlivspolitik`), (e) `<NewsletterSignup />`. Nederst: en trust-/betalings-række (tekst eller simple inline-SVG-badges — "Sikker betaling", kort-ikoner som simple SVG'er) + copyright + "Pitch/demo"-noten. Behold `bg-sol-ink`-stilen, gør den rigere. Footer henter selv kategorierne via Prisma (den er en Server Component) — eller får dem som prop fra layout; vælg det enkleste (Footer som async Server Component der selv kalder `prisma.category.findMany`).
- [ ] **Step 3:** `npx tsc --noEmit && npm run build`. Commit: `Overhaul footer with content links, newsletter and trust row`.

---

### Task 11: Design-finish — systematisk poleringsrunde

**Files:** Modificér på tværs efter behov: `app/globals.css`, storefront-sider/komponenter.

Dette er en fokuseret kvalitetsrunde — IKKE en omskrivning. Konkrete punkter:
- [ ] **Step 1:** Gennemgå typografi-skalaen: ensartede overskrift-størrelser (`h1`/`h2`/`h3`) på tværs af forside, kategori, produkt, info-sider, konto. Definér evt. genbrugelige klasser/tokens i `app/globals.css` hvis det reducerer gentagelse.
- [ ] **Step 2:** Ensartet spacing-rytme: sektions-padding (`py-12`/`py-16`), container-bredder (`max-w-7xl`), gaps — ret åbenlyse uoverensstemmelser.
- [ ] **Step 3:** Hover-/fokus-tilstande: sørg for at links, kort, knapper har konsistente, tydelige hover- og `focus-visible`-tilstande (tilgængelighed).
- [ ] **Step 4:** Gennemgå konto-siderne (`/konto`, login, opret, ordrer) og ordrebekræftelsen — de er funktionelle men kan have brug for samme polering som resten (kort-paneler, spacing).
- [ ] **Step 5:** Verificér responsivt: ingen åbenlyse layout-brud på mobil-bredde for de centrale sider.
- [ ] **Step 6:** `npx tsc --noEmit && npm run build && npm test && npm run test:e2e` — alt grønt.
- [ ] **Step 7:** Commit: `Design finish: consistent typography, spacing and interaction states`.

> Denne task er bevidst mindre præskriptiv end de øvrige — den udføres bedst af én agent med frihed til at polere skønsomt inden for retning B. Revieweren vurderer om resultatet er konsistent og uden regressioner.

---

## Self-Review

**1. Scope-dækning:** Indholdssider (admin-redigerbare, alle 7) ✓ (Task 1,3,4,5,7). Kategoribeskrivelser + fuld kategori-admin ✓ (Task 1,3,4,6,7). Logo + favicon + scaffold-oprydning ✓ (Task 8). Header (logo + rigtig søgeboks + mobil-menu) ✓ (Task 9). Footer-overhaul ✓ (Task 10). Grundig design-finish ✓ (Task 11).

**2. Placeholder-scan:** Ingen placeholders. Newsletter-signup er bevidst en mock (noteret i Task 10). Jura-tekst er "plausibel demo-tekst" — bevidst, ikke en mangel.

**3. Type-konsistens:** `Page`/`Category.description` (Task 1) bruges i `pageSchema`/`categorySchema` (Task 3), admin-actions (Task 4), admin-UI (Task 5,6), offentlige sider (Task 7). `renderContentBlocks` (Task 2) bruges i `app/info/[slug]/page.tsx` (Task 7). `Logo` (Task 8) bruges i Header (Task 9) + Footer (Task 10). Admin-actions returnerer det etablerede `{ ok }`-mønster.

**4. Ambiguitet:** `body` er ren tekst, ikke HTML (XSS-sikkert) — eksplicit. Tom `description` → `null` — eksplicit i Task 4. Footer som async Server Component der selv henter kategorier — eksplicit i Task 10.

**Afhængighedsrækkefølge:** 1 → 2 → 3 → 4 → 5,6 (parallelle i princippet, køres sekventielt) → 7 → 8 → 9 → 10 → 11. Task 11 sidst (polerer alt det foregående).

---

## REVISION (efter Stitch-reference + bruger-input)

Brugeren delte en Stitch-mockup og valgte **fuld re-skin** til et premium skandinavisk look:
afdæmpet sand/taupe-palet + **navy accent** (i stedet for orange), hvid header, annoncebjælke,
redaktionel hero (person i solbriller — Unsplash `photo-1503342217505-b0a15ec3261c`),
produktkort med badges ("Designed in Denmark", "Summer Edition") + "Quick View".

Design-tasks (oprindeligt 8-11) er erstattet af en fuld re-skin. Eksekveringsrækkefølge:
1. ✅ Page-model + Category.description + seed
2. **Design tokens re-skin** — remap `globals.css` `@theme`: navy accent, sand/taupe neutrals (+ ny `sol-sand`-token). Komponenter der bruger `sol-*`-tokens re-skinnes automatisk.
3. Logo + favicon + scaffold-oprydning
4. Annoncebjælke + header re-skin (hvid header, aktivt nav-underline, søgeboks, mobil-menu)
5. ProductCard re-skin (sand-kort, badges, hover Quick View)
6. Redaktionel hero + forside re-skin
7. Footer-overhaul
8. renderContentBlocks-helper (TDD)
9. Page + Category Zod-skemaer
10. Admin actions — Page + Category CRUD
11. Admin: side- + kategori-administration
12. Offentlige indholdssider + kategori-beskrivelser
13. Storefront re-skin-sweep (kategori/oversigt/produkt/kurv/checkout/konto) + design-finish + fuld verifikation

**Token-strategi:** behold token-NAVNE (`sol-accent` osv.), skift VÆRDIER. `sol-accent` → navy,
`sol-cream` → lys sand, `sol-sun` → varm taupe, `sol-ink` beholdes, `sol-muted` → varm grå.
Tilføj `sol-sand` (taupe til kort). Sweep-task'en (13) finpudser steder der ser skæve ud.
