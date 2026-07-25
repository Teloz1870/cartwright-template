# solbrillen.dk — Fase 5: Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** En beskyttet admin-sektion på `/admin` hvor en admin-bruger kan se et dashboard, oprette/redigere/slette produkter, se og statusændre ordrer, administrere rabatkoder, se kunder, og se de genererede e-mail-previews.

**Architecture:** Next.js 16 App Router. `/admin/*` beskyttes af middleware (kræver `role === "admin"`). Admin-sider er Server Components der henter via Prisma; mutationer sker via Server Actions i `app/admin/actions.ts`. Et `requireAdmin()`-helper i `lib/admin.ts` bruges af hver admin-side og hver admin-action til server-side rolle-tjek (defense in depth). Et fælles admin-layout med sidebar-navigation.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Prisma 6, Zod, Vitest.

**Forudsætning:** Fase 1-4 er merget til `main`. Auth.js virker (`lib/auth.ts`, `auth()`, roller i session), `middleware.ts` + `lib/auth.config.ts` findes, datamodellen findes, seed har en admin-bruger (`admin@solbrillen.dk` / `admin1234`, `role: "admin"`). `lib/format.ts`, `lib/products.ts`, `lib/validation.ts`, `lib/mailer.ts` (preview-mails i `.mail-previews/`) findes. Arbejd på ny branch `build/phase5-admin` (forgrenet fra `main`).

---

## Filstruktur (Fase 5)

| Fil | Ansvar |
|---|---|
| `lib/admin.ts` | `requireAdmin()` — server-side helper: `await auth()`, redirect til `/konto/login` hvis ikke logget ind, redirect til `/` (eller 403-side) hvis ikke admin; returnerer sessionen |
| `middleware.ts` | Modificér: udvid matcher til også at dække `/admin/:path*`; kræv login (rolle-tjekket sker i `requireAdmin` server-side) |
| `lib/validation.ts` | Modificér: tilføj `productSchema` og `discountCodeSchema` (Zod) |
| `app/admin/actions.ts` | Server Actions: produkt-CRUD, ordre-statusændring, rabatkode-CRUD — hver kalder `requireAdmin()` først |
| `app/admin/layout.tsx` | Admin-layout: sidebar-nav (Dashboard, Produkter, Ordrer, Rabatkoder, Kunder, Mails) + indholdsområde |
| `app/admin/page.tsx` | Dashboard: nøgletal (antal ordrer, omsætning, antal produkter, lav lagerbeholdning) |
| `app/admin/produkter/page.tsx` | Produktliste med "rediger"/"slet" + "nyt produkt"-link |
| `app/admin/produkter/nyt/page.tsx` | Opret-produkt-side |
| `app/admin/produkter/[id]/page.tsx` | Rediger-produkt-side |
| `components/admin/ProductForm.tsx` | Client: produktformular (bruges af både ny + rediger) |
| `components/admin/DeleteProductButton.tsx` | Client: slet-knap med bekræftelse |
| `app/admin/ordrer/page.tsx` | Ordreliste |
| `app/admin/ordrer/[id]/page.tsx` | Ordredetalje + statusændring |
| `components/admin/OrderStatusForm.tsx` | Client: statusændrings-dropdown |
| `app/admin/rabatkoder/page.tsx` | Rabatkode-liste + opret + slet/deaktivér |
| `components/admin/DiscountCodeForm.tsx` | Client: opret-rabatkode-formular |
| `app/admin/kunder/page.tsx` | Kundeoversigt (read-only) |
| `app/admin/mails/page.tsx` | Liste over genererede preview-mails fra `.mail-previews/` |

---

## Designnoter (gælder hele fasen)

- **To-lags beskyttelse:** middleware kræver login på `/admin/*` (kan ikke rolle-tjekke pålideligt på Edge uden DB), og `requireAdmin()` (kaldt i hver admin-side og hver admin-action) gør det rigtige rolle-tjek server-side. Aldrig kun det ene.
- **`requireAdmin()`** returnerer sessionen ved succes, ellers kalder den `redirect(...)` (kaster, så koden efter den ved at sessionen er admin).
- Priser indtastes i admin i **kroner** og konverteres til øre ved gem (eller indtastes direkte i øre — vælg kroner i UI, konv-ér i action; vær konsekvent og dokumentér i `ProductForm`/action).
- `Product.images` gemmes som JSON-array-streng — admin-formularen tager én eller flere billede-URL'er (fx ét tekstfelt med komma- eller linjeseparerede URLs) og `JSON.stringify`'er dem.
- Stil efter visuel retning B men admin må gerne være mere funktionel/tæt end storefront — tabeller, kompakte formularer. Hold det rent.
- Alle admin-actions returnerer `{ ok: true } | { ok: false, error: string }` og kalder `revalidatePath` på den relevante admin-sti.

---

### Task 1: `requireAdmin` + middleware-udvidelse

**Files:**
- Create: `lib/admin.ts`
- Modify: `middleware.ts`

**Kontrakt — `lib/admin.ts`:** Eksportér `requireAdmin(): Promise<Session>`. Implementering: `const session = await auth()` (fra `@/lib/auth`). Hvis ingen session → `redirect("/konto/login")`. Hvis `session.user.role !== "admin"` → `redirect("/")` (en almindelig kunde sendes til forsiden — simpelt og fint for en demo). Ellers returnér `session`. Importér `redirect` fra `next/navigation`. (Typen `Session` kan udledes — brug `Awaited<ReturnType<typeof auth>>` og smal den med en non-null-antagelse efter tjekkene, eller bare returnér `session` og lad TypeScript se at den er non-null efter guards.)

**Kontrakt — `middleware.ts` ændring:** Udvid `config.matcher` til `["/konto/:path*", "/admin/:path*"]`. I middleware-funktionen: for `/admin/:path*`, kræv blot at der ER en session (login) — hvis ikke, redirect til `/konto/login`. Selve admin-rolle-tjekket gøres af `requireAdmin()` server-side (Edge-middleware kan ikke pålideligt slå rollen op i DB, men `role` ER i JWT-tokenet — så hvis det er nemt at læse `req.auth?.user?.role` i middleweren og redirecte ikke-admins, må du gerne gøre det dér også; men `requireAdmin` er den autoritative kilde). Bevar den eksisterende `/konto`-logik (login/opret offentlige) uændret.

**Steps:**
- [ ] Step 1: Skriv `lib/admin.ts`.
- [ ] Step 2: Modificér `middleware.ts` — udvid matcher + `/admin`-håndtering.
- [ ] Step 3: Verificér — `cd /Users/kennimadsen/Documents/solbrillen.dk && npx tsc --noEmit && npm run build`. Functional: start dev-server (baggrund, timeout), `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin` → forvent 307 (redirect, ingen session). Stop server.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add requireAdmin helper and extend middleware to /admin"`

**Context:** `lib/auth.ts` eksporterer `auth`. `lib/auth.config.ts` har `callbacks` der lægger `role` i token+session. `middleware.ts` bruger pt. `lib/auth.config.ts` via en Edge-safe `NextAuth(authConfig)`. `req.auth` i middleweren har sessionen (med `user.role` hvis callbacks kører på Edge — verificér; hvis `role` ikke er der på Edge, så lad middleweren kun kræve login og lad `requireAdmin` om rollen).

---

### Task 2: Zod-skemaer for produkt + rabatkode

**Files:**
- Modify: `lib/validation.ts`

**Kontrakt:** Tilføj til `lib/validation.ts` (bevar `checkoutSchema`, `registerSchema`):
- `productSchema` (Zod): `name` (min 2), `slug` (min 2, kun `[a-z0-9-]` — regex `/^[a-z0-9-]+$/`, dansk fejl), `description` (min 10), `priceKr` (coerce til number, positivt — admin indtaster kroner), `stock` (coerce til int, ≥ 0), `frameColor` (min 1), `lensColor` (min 1), `brand` (min 1), `categoryId` (min 1), `featured` (boolean, default false — fra et checkbox; håndtér at FormData giver `"on"`/undefined), `images` (streng — rå tekst med URL'er, valgfri/kan være tom). Eksportér `ProductInput = z.infer<typeof productSchema>`.
- `discountCodeSchema` (Zod): `code` (min 3, transformér til uppercase+trim), `type` (enum `["percent","fixed"]`), `value` (coerce number, positivt). Eksportér `DiscountCodeInput`.
Brug danske fejlbeskeder. Brug `z.coerce.number()` for talfelter (FormData giver strenge).

**Steps:**
- [ ] Step 1: Tilføj `productSchema` + `discountCodeSchema` (+ typer) til `lib/validation.ts`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build && npm test` (35 tests grønne).
- [ ] Step 3: Commit — `git add -A && git commit -m "Add product and discount code validation schemas"`

---

### Task 3: Admin Server Actions

**Files:**
- Create: `app/admin/actions.ts`

**Kontrakt:** `"use server"`. HVER action kalder `requireAdmin()` (fra `@/lib/admin`) som første linje. Eksportér:
- `createProduct(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }>` — parse med `productSchema`; konvertér `priceKr` → `priceDkk` (×100, afrund); `images`: split den rå tekst på komma/linjeskift, trim, filtrér tomme, `JSON.stringify` arrayet (tom tekst → `"[]"`); `featured` fra checkbox; `prisma.product.create`. Tjek slug-unikhed (fang Prisma unique-fejl eller tjek først) → dansk fejl ved dublet-slug. `revalidatePath("/admin/produkter")`. Returnér `{ ok, id }`.
- `updateProduct(id: string, formData: FormData)` — som `createProduct` men `prisma.product.update`; returnér `{ ok: true }`/`{ ok: false, error }`. `revalidatePath("/admin/produkter")` og `revalidatePath("/produkt/[slug]", "page")`-agtigt (eller bare revalider produkt-stier bredt).
- `deleteProduct(id: string): Promise<{ ok: true } | { ok: false; error: string }>` — `prisma.product.delete`. BEMÆRK: et produkt kan være refereret af `OrderItem`/`CartItem`. `OrderItem.product` er en påkrævet relation → sletning fejler hvis produktet er i en ordre. Fang dette og returnér en venlig dansk fejl ("Produktet kan ikke slettes, da det indgår i ordrer — fjern det fra sortimentet ved at sætte lager til 0 i stedet" — ELLER: slet i stedet kun hvis muligt). Hold det enkelt: prøv at slette, fang fejlen, returnér besked. `revalidatePath("/admin/produkter")`.
- `updateOrderStatus(orderId: string, status: string): Promise<{ ok: true } | { ok: false; error: string }>` — validér at `status` er en af `["pending","paid","shipped","cancelled"]`; `prisma.order.update`. `revalidatePath("/admin/ordrer")` + `revalidatePath("/admin/ordrer/[id]","page")`.
- `createDiscountCode(formData: FormData)` — parse med `discountCodeSchema`; `prisma.discountCode.create` (sæt `active: true`, `usageCount: 0`); fang dublet-kode. `revalidatePath("/admin/rabatkoder")`.
- `toggleDiscountCode(id: string): Promise<{ ok: true } | { ok: false; error: string }>` — slå `active` om (læs nuværende, sæt modsat). `revalidatePath("/admin/rabatkoder")`.

Alt i try/catch med venlige danske fejl.

**Steps:**
- [ ] Step 1: Skriv `app/admin/actions.ts`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 3: Commit — `git add -A && git commit -m "Add admin server actions for products, orders and discount codes"`

**Context:** `lib/db.ts` → `prisma`. Modeller: `Product` (`name, slug, description, priceDkk, images, stock, frameColor, lensColor, brand, featured, categoryId`), `Order` (`status`), `DiscountCode` (`code, type, value, validUntil, usageLimit, usageCount, active`). `revalidatePath` fra `next/cache`.

---

### Task 4: Admin-layout

**Files:**
- Create: `app/admin/layout.tsx`

**Kontrakt:** Et layout for hele `/admin`-træet. Det er en `async` Server Component der kalder `requireAdmin()` øverst (så HELE admin-sektionen er beskyttet, defense-in-depth oven på middleware). Renderer: en sidebar/topbar med navigationslinks — Dashboard (`/admin`), Produkter (`/admin/produkter`), Ordrer (`/admin/ordrer`), Rabatkoder (`/admin/rabatkoder`), Kunder (`/admin/kunder`), Mails (`/admin/mails`) — plus et link "Til butikken" (`/`). `{children}` rendres i indholdsområdet. Stil: ren, funktionel, retning B-farver (fx mørk sidebar med `sol-ink`, accent på aktivt link). BEMÆRK: dette layout ligger inde i root-layoutet, så storefront-`Header`/`Footer` vises også — det er acceptabelt for en demo, men hvis det ser rodet ud, må admin-layoutet gerne være visuelt selvstændigt (en tydelig admin-bjælke). Hold det enkelt.

**Steps:**
- [ ] Step 1: Skriv `app/admin/layout.tsx`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 3: Commit — `git add -A && git commit -m "Add admin layout with sidebar navigation"`

---

### Task 5: Dashboard

**Files:**
- Create: `app/admin/page.tsx`

**Kontrakt:** `async` Server Component. Kald `requireAdmin()`. Hent nøgletal via Prisma: antal ordrer (`prisma.order.count()`), samlet omsætning (`prisma.order.aggregate({ _sum: { totalDkk: true }, where: { status: { not: "cancelled" } } })`), antal produkter (`prisma.product.count()`), antal produkter med lavt lager (`prisma.product.count({ where: { stock: { lte: 3 } } })`), antal kunder (`prisma.user.count({ where: { role: "customer" } })`). Vis dem som kort/"stat cards" i et grid, med pæne danske labels og `formatPriceDkk` for omsætning. Eventuelt en lille liste over de 5 nyeste ordrer med link til `/admin/ordrer/[id]`. Stil retning B.

**Steps:**
- [ ] Step 1: Skriv `app/admin/page.tsx`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 3: Commit — `git add -A && git commit -m "Add admin dashboard with key metrics"`

---

### Task 6: Produkt-administration

**Files:**
- Create: `components/admin/ProductForm.tsx`
- Create: `components/admin/DeleteProductButton.tsx`
- Create: `app/admin/produkter/page.tsx`
- Create: `app/admin/produkter/nyt/page.tsx`
- Create: `app/admin/produkter/[id]/page.tsx`

**Kontrakt — `components/admin/ProductForm.tsx`:** `"use client"`. Props: `{ categories: {id,name}[]; product?: <eksisterende produkt eller undefined>; }`. Renderer en formular med felter for alle `productSchema`-felterne: `name`, `slug`, `description` (textarea), `priceKr` (number — hvis `product` gives, vis `product.priceDkk/100`), `stock` (number), `frameColor`, `lensColor`, `brand`, `categoryId` (select fra `categories`), `featured` (checkbox), `images` (textarea — hvis `product` gives, vis dens billed-URLs joinet med linjeskift; ellers tom). Input-`name`-attributter matcher `productSchema`-feltnavnene. Ved submit: hvis `product` gives, kald `updateProduct(product.id, formData)`; ellers `createProduct(formData)` (begge fra `@/app/admin/actions`). `useTransition`. Ved `ok:true`: `router.push("/admin/produkter")`. Ved `ok:false`: vis fejl. Submit-knap "Gem produkt".

**Kontrakt — `components/admin/DeleteProductButton.tsx`:** `"use client"`. Props `{ productId: string }`. En "Slet"-knap der ved klik beder om bekræftelse (`confirm("Slet dette produkt?")` er fint for en demo), så kalder `deleteProduct(productId)` i `useTransition`. Ved `ok:false` viser den fejlen (fx `alert(error)` eller en lille inline-besked).

**Kontrakt — `app/admin/produkter/page.tsx`:** `async` Server Component. `requireAdmin()`. Hent alle produkter (`prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" } })`). Vis en tabel: navn, brand, kategori, pris (`formatPriceDkk`), lager, "Fremhævet"-markering, og handlinger ("Rediger" → `/admin/produkter/[id]`, `<DeleteProductButton>`). Et "+ Nyt produkt"-link til `/admin/produkter/nyt` øverst.

**Kontrakt — `app/admin/produkter/nyt/page.tsx`:** `async` Server Component. `requireAdmin()`. Hent kategorier. Overskrift "Nyt produkt" + `<ProductForm categories={...} />` (uden `product`).

**Kontrakt — `app/admin/produkter/[id]/page.tsx`:** `async` Server Component. `requireAdmin()`. `params: Promise<{id:string}>`. Hent produktet (`findUnique`) — `notFound()` hvis null. Hent kategorier. Overskrift "Rediger produkt" + `<ProductForm categories={...} product={produkt} />`.

**Steps:**
- [ ] Step 1: Skriv `components/admin/ProductForm.tsx`.
- [ ] Step 2: Skriv `components/admin/DeleteProductButton.tsx`.
- [ ] Step 3: Skriv `app/admin/produkter/page.tsx`.
- [ ] Step 4: Skriv `app/admin/produkter/nyt/page.tsx`.
- [ ] Step 5: Skriv `app/admin/produkter/[id]/page.tsx`.
- [ ] Step 6: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 7: Commit — `git add -A && git commit -m "Add product administration (list, create, edit, delete)"`

---

### Task 7: Ordre-administration

**Files:**
- Create: `components/admin/OrderStatusForm.tsx`
- Create: `app/admin/ordrer/page.tsx`
- Create: `app/admin/ordrer/[id]/page.tsx`

**Kontrakt — `components/admin/OrderStatusForm.tsx`:** `"use client"`. Props `{ orderId: string; currentStatus: string }`. En `<select>` med de fire statusser (`pending`/`paid`/`shipped`/`cancelled`, danske labels) + en "Opdatér"-knap. Ved submit kalder den `updateOrderStatus(orderId, status)` (fra `@/app/admin/actions`) i `useTransition`; viser kort succes/fejl.

**Kontrakt — `app/admin/ordrer/page.tsx`:** `async` Server Component. `requireAdmin()`. Hent alle ordrer (`prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })`). Tabel: ordrenummer (link til `/admin/ordrer/[id]`), dato, kunde-email, status, antal varer, total (`formatPriceDkk`).

**Kontrakt — `app/admin/ordrer/[id]/page.tsx`:** `async` Server Component. `requireAdmin()`. `params: Promise<{id:string}>`. Hent ordren (`findUnique` med `items`) — `notFound()` hvis null. Vis: ordrenummer, dato, kunde-email + leveringsadresse, varelinjer (`productName × quantity`, beløb), subtotal/rabat/fragt/total, og `<OrderStatusForm orderId={order.id} currentStatus={order.status} />`.

**Steps:**
- [ ] Step 1: Skriv `components/admin/OrderStatusForm.tsx`.
- [ ] Step 2: Skriv `app/admin/ordrer/page.tsx`.
- [ ] Step 3: Skriv `app/admin/ordrer/[id]/page.tsx`.
- [ ] Step 4: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 5: Commit — `git add -A && git commit -m "Add order administration with status updates"`

---

### Task 8: Rabatkode-administration

**Files:**
- Create: `components/admin/DiscountCodeForm.tsx`
- Create: `app/admin/rabatkoder/page.tsx`

**Kontrakt — `components/admin/DiscountCodeForm.tsx`:** `"use client"`. Formular: `code` (text), `type` (select percent/fixed), `value` (number — for percent: 0-100; for fixed: kroner — men gem som angivet; **dokumentér**: for `fixed` indtastes kroner og actionen ×100 til øre, ELLER indtast direkte — VÆLG: indtast i kroner for `fixed`, og lad `createDiscountCode`-action konvertere `fixed`-værdi ×100 til øre, `percent`-værdi uændret. Sørg for at `app/admin/actions.ts`'s `createDiscountCode` matcher dette — hvis det ikke gør, så juster action og note den her). Submit kalder `createDiscountCode(formData)` i `useTransition`. Ved `ok` ryddes formularen / `router.refresh()`.

> **Note om enhed:** For at undgå tvetydighed: `discountCodeSchema` validerer `value` som et positivt tal. `createDiscountCode`-action skal: for `type==="fixed"` gemme `value * 100` (kroner→øre), for `type==="percent"` gemme `value` som-er. Hvis Task 3's `createDiscountCode` ikke allerede gør dette, OPDATÉR `app/admin/actions.ts` i denne task så det stemmer, og noter ændringen.

**Kontrakt — `app/admin/rabatkoder/page.tsx`:** `async` Server Component. `requireAdmin()`. Hent alle rabatkoder (`prisma.discountCode.findMany({ orderBy: { id: "desc" } })`). Vis: `<DiscountCodeForm />` øverst, så en tabel: kode, type, værdi (procent vist som "10%", fixed vist via `formatPriceDkk`), forbrug (`usageCount`/`usageLimit ?? "∞"`), aktiv-status, og en "Aktivér/Deaktivér"-knap (en lille client-komponent ELLER en inline `<form>` med en server action — vælg en lille client-knap der kalder `toggleDiscountCode(id)`; lav den evt. som en lokal komponent i filen eller en separat fil — hold det enkelt).

**Steps:**
- [ ] Step 1: Skriv `components/admin/DiscountCodeForm.tsx` (og en lille toggle-knap-komponent).
- [ ] Step 2: Skriv `app/admin/rabatkoder/page.tsx`.
- [ ] Step 3: (Hvis nødvendigt) justér `createDiscountCode` i `app/admin/actions.ts` for kroner→øre på `fixed`.
- [ ] Step 4: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 5: Commit — `git add -A && git commit -m "Add discount code administration"`

---

### Task 9: Kunder + Mails

**Files:**
- Create: `app/admin/kunder/page.tsx`
- Create: `app/admin/mails/page.tsx`

**Kontrakt — `app/admin/kunder/page.tsx`:** `async` Server Component. `requireAdmin()`. Hent kunder (`prisma.user.findMany({ where: { role: "customer" }, include: { _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" } })`). Vis en read-only tabel: navn, email, antal ordrer, oprettet-dato (dansk format). Ingen mutationer.

**Kontrakt — `app/admin/mails/page.tsx`:** `async` Server Component. `requireAdmin()`. Læs filerne i `.mail-previews/`-mappen (`fs/promises` `readdir`; håndtér at mappen måske ikke findes endnu → vis tom-tilstand "Ingen preview-mails endnu"). For hver `.html`-fil: vis filnavnet og — enkleste tilgang — indlejr indholdet i en `<details>`/`<iframe srcDoc>` ELLER vis bare en liste over filnavne med ordrenummer udledt af filnavnet. **Vælg:** vis en liste over preview-mails, hver i et `<details>`-element der viser HTML-indholdet renderet i en `<iframe srcDoc={html}>` (læs filindholdet server-side med `readFile`). Hold det enkelt og robust. Dette er `import "server-only"`-territorium pga. `fs` — men en Server Component må gerne bruge `fs` direkte, så det er fint uden `server-only`.

**Steps:**
- [ ] Step 1: Skriv `app/admin/kunder/page.tsx`.
- [ ] Step 2: Skriv `app/admin/mails/page.tsx`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build && npm test` (35 tests grønne).
- [ ] Step 4: Commit — `git add -A && git commit -m "Add customer overview and email previews admin pages"`

---

## Self-Review

**1. Spec coverage (spec §6 admin + §10 fase 5):** Beskyttet `/admin` ✓ (Task 1 middleware + `requireAdmin`, Task 4 layout). Produkt-CRUD ✓ (Task 3 actions + Task 6 UI). Ordrestyring + statusændring ✓ (Task 3 + Task 7). Rabatkode-CRUD ✓ (Task 3 + Task 8). Kundeoversigt ✓ (Task 9). Dashboard med nøgletal ✓ (Task 5). E-mail-previews ✓ (Task 9 — spec §6 nævner "vises i /admin/ordrer og logges"; her som en dedikeret `/admin/mails`-side, hvilket dækker intentionen bedre).

**2. Placeholder scan:** Ingen placeholders. Note i Task 8 om kroner→øre-konvertering for `fixed`-rabatkoder er en eksplicit instruktion, ikke en placeholder.

**3. Type-konsistens:** `requireAdmin` (Task 1) bruges i alle admin-sider (Task 4-9) og alle admin-actions (Task 3). `productSchema`/`discountCodeSchema` (Task 2) bruges i `app/admin/actions.ts` (Task 3) og formularerne (Task 6, 8). Admin-actions (Task 3) bruges af `ProductForm` (Task 6), `OrderStatusForm` (Task 7), `DiscountCodeForm` (Task 8). `formatPriceDkk` (Fase 2) bruges i Task 5, 6, 7, 8. `app/admin/actions.ts` `createDiscountCode` kroner→øre-konvertering for `fixed` skal stemme mellem Task 3 og Task 8 — Task 8 instruerer eksplicit at verificere/justere.

**4. Ambiguitet:** Edge-middleware kan måske ikke læse `role` pålideligt → eksplicit: middleware kræver kun login, `requireAdmin` er autoritativ. Pris-enhed (kroner i UI, øre i DB) → eksplicit i designnoter og Task 6/8. Produkt-sletning mod FK-begrænsning → eksplicit håndteret i Task 3.

**Afhængighedsrækkefølge:** Task 1 (requireAdmin + middleware) og Task 2 (skemaer) først, uafhængige af hinanden. Task 3 (actions) afhænger af 1+2. Task 4 (layout) afhænger af 1. Task 5-9 afhænger af 1+3+4. Sekventiel 1→9 passer.
