# solbrillen.dk — Design Spec

**Dato:** 2026-05-14
**Status:** Godkendt arbejdsgrundlag (visuel retning B bekræftet af bruger; arkitektur og scope bekræftet via clarifying questions)
**Type:** Pitch/demo-prototype af komplet webshop

## 1. Formål

solbrillen.dk er en komplet, fuldt funktionel webshop for solbriller — frontend og backend — bygget som en **pitch/demo-prototype**. Den skal kunne demonstreres lokalt med én kommando, have ægte backend (API, database, admin) og dække hele indkøbsrejsen. Den er *ikke* produktionssat: betaling er mock, og e-mails vises som previews i stedet for at blive afsendt.

Den skal kunne migreres til en rigtig drift senere (rigtig betalingsudbyder, Postgres, mailserver) uden at designet skal laves om — datalaget og betalingslaget er isoleret bag interfaces.

## 2. Brugerens bekræftede valg

| Spørgsmål | Valg |
|---|---|
| Platform/stack | Next.js full-stack (App Router) med egne API-routes, Prisma + SQLite, indbygget admin |
| Omfang | Fuld shop (katalog, kurv, checkout, konti, ordrehistorik, rabatkoder, lager, fragt, e-mails, søgning/filtre, kategorier) |
| Drift | Pitch/demo-prototype — funktionel, ikke nødvendigvis produktionsklar |
| Betaling | Ingen rigtig betaling — mock-checkout |
| Visuel retning | B — bold sommer-lifestyle (varme farver, store fede typer, runde knapper, energisk) |

## 3. Teknologivalg

- **Framework:** Next.js 15 (App Router), TypeScript
- **Database:** SQLite via Prisma ORM (én fil, nul opsætning; skiftbar til Postgres via `DATABASE_URL` uden kodeændringer)
- **Auth:** Auth.js (NextAuth) med credentials-provider (email/password), roller `customer` / `admin`
- **Styling:** Tailwind CSS
- **Validering:** Zod på alle formularer og API-input
- **Test:** Vitest (unit) + Playwright (E2E happy paths)
- **Sprog/valuta:** Dansk UI, priser i DKK
- **Mock-betaling:** Et `PaymentProvider`-interface med en `MockPaymentProvider`-implementering der altid lykkes
- **E-mails:** Et `Mailer`-interface med en `PreviewMailer` der gemmer mails som HTML-previews i `/admin` og logger til konsollen

## 4. Arkitektur

Ét Next.js-projekt indeholder både storefront og backend:

```
solbrillen.dk/
  app/
    (storefront)/
      page.tsx                  # forside
      produkter/page.tsx        # alle produkter + søgning/filtre
      kategori/[slug]/page.tsx  # kategoriside
      produkt/[slug]/page.tsx   # produktside
      kurv/page.tsx             # kurv
      checkout/page.tsx         # checkout (mock-betaling)
      ordre/[id]/page.tsx       # ordrebekræftelse
      konto/
        page.tsx                # profil
        ordrer/page.tsx         # ordrehistorik
        login/page.tsx
        opret/page.tsx
    admin/
      page.tsx                  # dashboard
      produkter/                # produkt-CRUD
      ordrer/                   # ordrestyring
      rabatkoder/               # rabatkode-CRUD
      kunder/                   # kundeoversigt
    api/
      cart/route.ts
      checkout/route.ts
      products/route.ts
      auth/[...nextauth]/route.ts
      admin/                    # beskyttede admin-mutationer
  components/                   # genbrugelige UI-komponenter
  lib/
    db.ts                       # Prisma-klient
    auth.ts                     # Auth.js-konfiguration
    cart.ts                     # kurv-logik (ren, testbar)
    pricing.ts                  # pris-/rabat-/fragtberegning (ren, testbar)
    payment.ts                  # PaymentProvider-interface + MockPaymentProvider
    mailer.ts                   # Mailer-interface + PreviewMailer
    validation.ts               # Zod-skemaer
  prisma/
    schema.prisma
    seed.ts                     # ~20-30 fiktive solbriller + kategorier + admin-bruger
  tests/
    unit/                       # Vitest
    e2e/                        # Playwright
```

**Designprincip — isolation:** Forretningslogik (kurv, pris, rabat, fragt, lager) lægges i rene funktioner i `lib/` der kan testes uden database eller HTTP. API-routes og sider er tynde lag ovenpå. Betaling og mail er bag interfaces, så de kan skiftes uden at røre resten.

## 5. Datamodel (Prisma)

- **Product** — `id`, `name`, `slug`, `description`, `priceDkk` (øre, heltal), `images` (JSON-array), `stock`, `frameColor`, `lensColor`, `brand`, `categoryId`, `featured` (bool), `createdAt`
- **Category** — `id`, `name`, `slug` (fx Herre, Dame, Sport, Polariseret, Børn)
- **User** — `id`, `email`, `passwordHash`, `name`, `role` (`customer` | `admin`), `createdAt`
- **Cart** — `id`, `sessionId` (cookie) eller `userId`, `createdAt`, `updatedAt`
- **CartItem** — `id`, `cartId`, `productId`, `quantity`
- **Order** — `id`, `userId` (nullable for gæst), `email`, `status` (`pending` | `paid` | `shipped` | `cancelled`), `shippingName`, `shippingAddress`, `shippingZip`, `shippingCity`, `subtotalDkk`, `shippingDkk`, `discountDkk`, `totalDkk`, `discountCode` (nullable), `createdAt`
- **OrderItem** — `id`, `orderId`, `productId`, `productName` (snapshot), `unitPriceDkk` (snapshot), `quantity`
- **DiscountCode** — `id`, `code`, `type` (`percent` | `fixed`), `value`, `validUntil` (nullable), `usageLimit` (nullable), `usageCount`, `active`

Priser gemmes som heltal i øre for at undgå floating point-fejl.

## 6. Features

| Område | Indhold |
|---|---|
| Katalog | Forside med fremhævede produkter + kategorier; kategorisider; produktside med billeder, lager-status, "læg i kurv", relaterede produkter |
| Søgning/filtre | Fritekstsøgning på navn/brand; filtrering på kategori, stelfarve, glasfarve, brand, prisinterval; sortering (pris, nyeste) |
| Kurv | Tilføj/fjern/justér antal; gæstekurv via signeret session-cookie; kurv-badge i header; kurv flettes til brugerkonto ved login |
| Checkout | Leveringsformular (Zod-valideret); fragtberegning (fast sats, gratis over beløbsgrænse); rabatkode-felt; mock-betaling; ordreoprettelse; lager nedskrives; bekræftelsesside + preview-mail |
| Lager | `stock` pr. produkt; "udsolgt"-tilstand i UI; checkout afviser hvis lager ikke rækker |
| Konti | Registrering, login (Auth.js), profilside, ordrehistorik ("Mine ordrer") med ordredetaljer |
| E-mails | Ordrebekræftelse genereres som HTML-preview (vises i `/admin/ordrer` og logges) — ingen rigtig afsendelse i demo |
| Admin | Beskyttet `/admin`: produkt-CRUD (inkl. lager og billeder via URL), ordreoversigt + statusændring, rabatkode-CRUD, kundeoversigt; dashboard med nøgletal (antal ordrer, omsætning, lav lagerbeholdning) |

## 7. Dataflow

- **Browsing:** Server Component → Prisma → render (SEO-venligt, hurtigt)
- **Kurv:** Klient → `POST/PATCH/DELETE /api/cart` → DB-kurv nøglet på session-cookie eller `userId` → UI opdateres
- **Checkout:** Formular → `POST /api/checkout` → Zod-validering → lager-tjek → rabatkode-validering → `pricing.ts` beregner total → `Order` oprettes i transaktion (lager nedskrives, `CartItem` ryddes) → `MockPaymentProvider.charge()` → status sættes `paid` → `PreviewMailer.send()` → redirect til ordrebekræftelse
- **Auth:** Auth.js credentials; admin-routes beskyttes af middleware der tjekker `role === 'admin'`
- **Admin-mutationer:** `/api/admin/*` route handlers, beskyttet af samme rolle-tjek

## 8. Fejlhåndtering

- Zod-validering på alle formularer og API-input; venlige danske fejlbeskeder i UI
- Lager-tjek ved checkout med tydelig besked hvis en vare er udsolgt eller antal overstiger lager
- Ugyldig/udløbet rabatkode afvises med besked
- 404-sider for manglende produkter/kategorier/ordrer
- API-routes returnerer strukturerede fejl: `{ error: { code, message } }`
- Checkout kører i en DB-transaktion — fejler noget, oprettes ingen ordre og lager nedskrives ikke

## 9. Test

Fokuseret på kerne-handelslogik (det er en demo, ikke fuld dækning):

- **Vitest (unit):** `pricing.ts` (subtotal, fragt, rabat — percent og fixed, beløbsgrænse for gratis fragt), `cart.ts` (tilføj/flet/antal), lager-validering, Zod-skemaer
- **Playwright (E2E):** (1) browse forside → produktside → læg i kurv → checkout → ordrebekræftelse; (2) opret konto → login → se ordrehistorik; (3) admin login → opret produkt → se det i storefront

## 10. Faseinddeling (til implementeringsplanen)

Hver fase er selvstændigt kørbar og demonstrerbar:

1. **Fundament** — Next.js-projekt, Tailwind, Prisma-schema, `lib/db.ts`, seed-script med ~20-30 fiktive solbriller, kategorier og admin-bruger
2. **Katalog** — forside, kategori-, produkt- og produktoversigtssider; søgning, filtre, sortering; design-system (visuel retning B)
3. **Kurv + checkout** — kurv-logik og UI, `pricing.ts`, fragtberegning, rabatkoder, mock-betaling, lager-nedskrivning, ordrebekræftelse, preview-mail
4. **Konti** — Auth.js, registrering, login, profil, ordrehistorik, kurv-fletning ved login
5. **Admin** — beskyttet admin, produkt-/ordre-/rabatkode-CRUD, kundeoversigt, dashboard
6. **Polish & test** — Vitest- og Playwright-tests, design-finish, e-mail-preview-visning, fejlsider, README med kørselsvejledning

## 11. Eksplicit uden for scope (YAGNI)

- Rigtig betalingsintegration (Stripe/Quickpay/MobilePay) — kun mock
- Rigtig e-mailafsendelse — kun previews
- Produktanmeldelser og ratings
- Ønskeliste/favoritter
- Flersprogethed — kun dansk
- Postgres/produktionshosting — SQLite lokalt (men `DATABASE_URL` gør skift muligt)
- Lagerstyring på varianter (kun ét lagertal pr. produkt)
- Reel fragtudbyder-integration — fast sats + gratis over grænse

## 12. Succeskriterier

- `npm install && npm run dev` (efter `prisma migrate` + `seed`) starter en fuldt funktionel shop
- En besøgende kan: browse, søge, filtrere, lægge i kurv, gennemføre mock-checkout med rabatkode, oprette konto og se ordrehistorik
- En admin kan: logge ind, oprette/redigere produkter, se og statusændre ordrer, oprette rabatkoder, se kunder og dashboard-tal
- Vitest- og Playwright-tests passerer
- Visuel retning B er gennemført konsekvent i hele UI'et
