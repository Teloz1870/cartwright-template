# solbrillen.dk — Fase 4: Konti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Kundekonti — registrering, login/logout, beskyttet profilside, ordrehistorik, og sammenfletning af gæstekurv til brugerkonto ved login.

**Architecture:** Auth.js (NextAuth v5) med credentials-provider (email/password), JWT-session. `lib/auth.ts` holder auth-konfigurationen. Middleware beskytter `/konto/*`. `lib/cart.ts` udvides så en logget-ind bruger får sin egen brugerkurv (nøglet på `userId`), og gæstekurven flettes ind ved login. `placeOrder` opdateres til at sætte `userId` på ordren når en bruger er logget ind.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Prisma 6, Auth.js v5, bcryptjs, Zod, Vitest.

**Forudsætning:** Fase 1-3 er merget til `main`. `User`-modellen (`email`, `passwordHash`, `name`, `role`) findes. `bcryptjs` og `zod` er installeret. `lib/cart.ts`, `lib/validation.ts`, `app/checkout/actions.ts` findes. Arbejd på ny branch `build/phase4-konti` (forgrenet fra `main`).

---

## Filstruktur (Fase 4)

| Fil | Ansvar |
|---|---|
| `lib/auth.ts` | Auth.js-konfiguration: credentials-provider, JWT-session, callbacks (id+role i token/session), `signIn`-event der fletter kurv |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js route-handler (`GET`/`POST`) |
| `types/next-auth.d.ts` | Type-augmentering: `session.user.id` + `session.user.role` |
| `middleware.ts` | Beskytter `/konto` (redirect til login hvis ikke logget ind) |
| `lib/validation.ts` | Modificér: tilføj `registerSchema` |
| `lib/cart.ts` | Modificér: bruger-kurv (nøglet på `userId`) når logget ind; `mergeGuestCartIntoUser(userId)` |
| `app/konto/actions.ts` | Server Action: `registerUser` (bcrypt-hash, opret bruger, håndtér dublet-email) |
| `components/RegisterForm.tsx` | Client: registreringsformular |
| `components/LoginForm.tsx` | Client: login-formular (`signIn("credentials", ...)`) |
| `components/LogoutButton.tsx` | Client: logud-knap (`signOut`) |
| `app/konto/opret/page.tsx` | Registreringsside |
| `app/konto/login/page.tsx` | Login-side |
| `app/konto/page.tsx` | Beskyttet profilside (brugerinfo + logud) |
| `app/konto/ordrer/page.tsx` | Beskyttet ordrehistorik |
| `app/checkout/actions.ts` | Modificér: sæt `userId` på ordren når logget ind |
| `components/Header.tsx` | Modificér: vis "Log ind" / "Min konto" afhængigt af session |
| `.env` | Tilføj `AUTH_SECRET` |

---

## Designnoter (gælder hele fasen)

- **Auth.js v5** (`next-auth@beta`): config-objekt eksporterer `{ handlers, auth, signIn, signOut }` fra `lib/auth.ts`. Session-strategi: `"jwt"` (påkrævet for credentials-provider). `AUTH_SECRET` sættes i `.env` (gitignored).
- **Roller:** `User.role` er `"customer"` eller `"admin"`. Token/session-callbacks kopierer `id` og `role` ind, så de er tilgængelige via `auth()`. Admin-brug kommer i Fase 5 — i Fase 4 sørger vi bare for at `role` er med i sessionen.
- **Kurv ved login:** gæstekurv (cookie `kurv_session`) flettes ind i brugerens kurv. En logget-ind bruger bruger fremover sin `userId`-kurv. Gæstekurv-cookien kan blive liggende — det gør ikke noime.
- **Beskyttede ruter:** `/konto` og `/konto/ordrer` kræver login. `/konto/login` og `/konto/opret` er offentlige. Uautoriseret adgang → redirect til `/konto/login`.
- Stil efter visuel retning B (varme farver, fede typer, pille-knapper).

---

### Task 1: Auth.js-opsætning

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `types/next-auth.d.ts`
- Modify: `.env` (tilføj `AUTH_SECRET`)

**Step 1: Installér Auth.js**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm install next-auth@beta`

**Step 2: Sæt `AUTH_SECRET` i `.env`**

Tilføj en linje til `.env`: `AUTH_SECRET="<en tilfældig streng>"` — generér med `npx auth secret` HVIS den kommando findes, ellers brug `openssl rand -base64 32` eller en hardkodet lang tilfældig streng. `.env` er gitignored.

**Step 3: Skriv `lib/auth.ts`**

Konfiguration:
- `import "server-only"` er IKKE nødvendig her (auth-config bruges af middleware/route-handler).
- Credentials-provider med `authorize(credentials)`: slå brugeren op via `prisma.user.findUnique({ where: { email } })`, sammenlign password med `bcrypt.compare(password, user.passwordHash)`. Ved match returnér `{ id, email, name, role }`; ellers `null`.
- `session: { strategy: "jwt" }`.
- `pages: { signIn: "/konto/login" }`.
- `callbacks.jwt`: ved login, kopiér `user.id` → `token.id` og `user.role` → `token.role`.
- `callbacks.session`: kopiér `token.id` → `session.user.id` og `token.role` → `session.user.role`.
- `events.signIn`: kald `mergeGuestCartIntoUser(user.id)` fra `@/lib/cart` (funktionen oprettes i Task 5 — for at Task 1 kan bygge alene, se note nedenfor).
- Eksportér `export const { handlers, auth, signIn, signOut } = NextAuth({ ... })`.

> **Rækkefølge-note:** `events.signIn` skal kalde `mergeGuestCartIntoUser`, som først laves i Task 5. For at Task 1 kan bygge: lav i Task 1 `events.signIn` som et kald til en funktion der allerede findes — ELLER lad `events.signIn` være tom/udeladt i Task 1 og tilføj kaldet i Task 5. **Vælg det sidste:** udelad `events.signIn` i Task 1; Task 5 tilføjer det. Noter dette i din rapport.

**Step 4: Skriv `app/api/auth/[...nextauth]/route.ts`**
```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

**Step 5: Skriv `types/next-auth.d.ts`** — augmentér `next-auth`-modulet så `Session["user"]` har `id: string` og `role: string`, og `User` har `role: string`. Augmentér også `next-auth/jwt` så `JWT` har `id` og `role`. Sørg for at `tsconfig.json` inkluderer `types/`-mappen (App Router-`tsconfig` har typisk `"include": ["**/*.ts", ...]` så det burde være dækket — verificér).

**Step 6: Verificér** — `npx tsc --noEmit && npm run build`. Build OK.

**Step 7: Commit** — `git add -A && git commit -m "Set up Auth.js with credentials provider"`

**Context for denne task:** `lib/db.ts` eksporterer `prisma`. `User`-modellen har `id, email, passwordHash, name, role`. `bcryptjs` er installeret (`import bcrypt from "bcryptjs"`). Auth.js v5 importeres som `import NextAuth from "next-auth"` og `import Credentials from "next-auth/providers/credentials"`. Hvis `next-auth@beta` har en anden API end forventet, tilpas fornuftigt og rapportér — kerne-målet er: credentials-login virker, `id`+`role` er i sessionen, `handlers` eksporteres.

---

### Task 2: Registrering

**Files:**
- Modify: `lib/validation.ts`
- Create: `app/konto/actions.ts`
- Create: `components/RegisterForm.tsx`
- Create: `app/konto/opret/page.tsx`

**Kontrakt — `lib/validation.ts` (tilføj):** Eksportér `registerSchema` (Zod): `name` (min 2), `email` (gyldig email), `password` (min 8 tegn, dansk fejl "Adgangskode skal være mindst 8 tegn"). Eksportér `RegisterInput = z.infer<typeof registerSchema>`. Bevar det eksisterende `checkoutSchema`.

**Kontrakt — `app/konto/actions.ts`:** `"use server"`. Eksportér `registerUser(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`. Flow: parse `name`/`email`/`password` fra FormData, validér med `registerSchema` (fejl → `{ ok:false, error }`). Tjek om email allerede findes (`prisma.user.findUnique`) → `{ ok:false, error: "Der findes allerede en bruger med denne e-mail" }`. Ellers: `bcrypt.hash(password, 10)`, `prisma.user.create({ data: { name, email, passwordHash, role: "customer" } })`, returnér `{ ok: true }`. Try/catch om det hele med en venlig dansk fejl.

**Kontrakt — `components/RegisterForm.tsx`:** `"use client"`. Formular (navn, email, password) med input-`name`s `name`/`email`/`password`. Ved submit: kald `registerUser(formData)` i `useTransition`. Ved `ok:true`: kald `signIn("credentials", { email, password, redirectTo: "/konto" })` (importeret fra... `signIn` fra `next-auth/react` på klienten — brug `import { signIn } from "next-auth/react"`) SÅ brugeren bliver logget ind med det samme; ELLER simplere: `router.push("/konto/login")` med en succes-besked. **Vælg `router.push("/konto/login?oprettet=1")`** — enklere og robust; login-siden kan vise en "Din konto er oprettet — log ind"-besked når `?oprettet=1`. Ved `ok:false`: vis fejlen. Stil efter retning B.

**Kontrakt — `app/konto/opret/page.tsx`:** Server Component. Hvis brugeren allerede er logget ind (`await auth()` har en session), redirect til `/konto`. Ellers vis en overskrift "Opret konto" + `<RegisterForm />` + et link til `/konto/login` ("Har du allerede en konto? Log ind").

**Steps:**
- [ ] Step 1: Tilføj `registerSchema` til `lib/validation.ts`.
- [ ] Step 2: Skriv `app/konto/actions.ts`.
- [ ] Step 3: Skriv `components/RegisterForm.tsx`.
- [ ] Step 4: Skriv `app/konto/opret/page.tsx`.
- [ ] Step 5: Verificér — `npx tsc --noEmit && npm run build && npm test` (35 tests grønne).
- [ ] Step 6: Commit — `git add -A && git commit -m "Add user registration"`

---

### Task 3: Login-side

**Files:**
- Create: `components/LoginForm.tsx`
- Create: `app/konto/login/page.tsx`

**Kontrakt — `components/LoginForm.tsx`:** `"use client"`. Formular (email, password). Ved submit: kald `signIn("credentials", { email, password, redirect: false })` (fra `next-auth/react`). Hvis resultatet indikerer fejl (`result?.error`), vis "Forkert e-mail eller adgangskode". Hvis succes: `router.push("/konto")` (og `router.refresh()`). Brug `useTransition`/pending-state. Hvis URL'en har `?oprettet=1` (læs via `useSearchParams`), vis en grøn "Din konto er oprettet — log ind"-besked øverst. Stil efter retning B.

**Kontrakt — `app/konto/login/page.tsx`:** Server Component. Hvis allerede logget ind (`await auth()`), redirect til `/konto`. Ellers: overskrift "Log ind" + `<LoginForm />` (wrap i `<Suspense>` da den bruger `useSearchParams`) + link til `/konto/opret` ("Ingen konto? Opret en").

**Steps:**
- [ ] Step 1: Skriv `components/LoginForm.tsx`.
- [ ] Step 2: Skriv `app/konto/login/page.tsx`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add login page"`

---

### Task 4: Middleware — beskyt `/konto`

**Files:**
- Create: `middleware.ts` (i projektroden)

**Kontrakt:** Brug Auth.js' middleware-mønster. Importér `auth` fra `@/lib/auth` og eksportér det som middleware, ELLER skriv en eksplicit middleware der tjekker `await auth()`-session. Beskyt `/konto` og `/konto/ordrer` — men IKKE `/konto/login` og `/konto/opret` (de skal være offentlige). Uautoriseret adgang til en beskyttet rute → `NextResponse.redirect` til `/konto/login`. Brug en `config.matcher` der rammer `/konto/:path*`. Inde i middleweren: hvis stien er `/konto/login` eller `/konto/opret`, lad den passere uanset; ellers kræv session.

> Forberedelse til Fase 5: matcheren må gerne også inkludere `/admin/:path*`, men admin-rolle-tjek tilføjes i Fase 5 — i Fase 4 er det fint blot at kræve login (eller helt lade `/admin` være; vælg at lade `/admin` være urørt i Fase 4 for at undgå at låse en endnu-ikke-eksisterende sektion).

**Steps:**
- [ ] Step 1: Skriv `middleware.ts`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`. Build skal stadig lykkes.
- [ ] Step 3: Commit — `git add -A && git commit -m "Add middleware protecting /konto routes"`

**Context:** Auth.js v5 understøtter `export { auth as middleware } from "@/lib/auth"` kombineret med en `config.matcher` — men en eksplicit middleware-funktion der selv tjekker stien og sessionen er også fin og giver mere kontrol over login/opret-undtagelserne. Vælg den eksplicitte tilgang for klarhed.

---

### Task 5: Bruger-kurv + kurv-fletning

**Files:**
- Modify: `lib/cart.ts`
- Modify: `lib/auth.ts`

**Kontrakt — `lib/cart.ts` ændringer:**
- `getOrCreateCart()` og `getCart()`: tjek først om der er en logget-ind bruger via `await auth()` (importér `auth` fra `@/lib/auth`). Hvis ja, brug brugerens kurv (`where: { userId }`) — `getOrCreateCart` opretter en `Cart` med `userId` hvis ingen findes; `getCart` returnerer brugerens kurv eller null. Hvis ingen bruger, fald tilbage til den nuværende session-cookie-adfærd.
- `getCartCount()`: virker uændret oven på den opdaterede `getCart()`.
- Tilføj `mergeGuestCartIntoUser(userId: string): Promise<void>` — læs gæstekurven via `kurv_session`-cookien; hvis der ikke er nogen, gør intet. Ellers: find/opret brugerens `userId`-kurv, flyt hver `CartItem` fra gæstekurven ind i brugerkurven (upsert med `quantity`-increment på `@@unique([cartId, productId])`), og slet derefter gæstekurvens `CartItem`-rækker (eller hele gæste-`Cart`-rækken). Funktionen kører i `events.signIn`-konteksten, hvor cookies er læsbare.

**Kontrakt — `lib/auth.ts` ændring:** Tilføj `events.signIn` til config-objektet: `async signIn({ user }) { if (user?.id) await mergeGuestCartIntoUser(user.id); }` — importér `mergeGuestCartIntoUser` fra `@/lib/cart`.

> Pas på cirkulær import: `lib/cart.ts` importerer `auth` fra `lib/auth.ts`, og `lib/auth.ts` importerer `mergeGuestCartIntoUser` fra `lib/cart.ts`. Dette er som regel OK i praksis (ESM håndterer cykliske imports når funktionerne kun kaldes på runtime, ikke på modul-init), men hvis det giver problemer ved build: flyt `mergeGuestCartIntoUser` til en separat fil `lib/cart-merge.ts` der importerer fra begge, og lad `lib/auth.ts` importere derfra. Rapportér hvilken løsning du valgte.

**Steps:**
- [ ] Step 1: Modificér `lib/cart.ts` — bruger-kurv-bevidsthed + `mergeGuestCartIntoUser`.
- [ ] Step 2: Modificér `lib/auth.ts` — tilføj `events.signIn`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build && npm test`.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add user carts and guest-cart merge on login"`

---

### Task 6: Profilside + logud

**Files:**
- Create: `components/LogoutButton.tsx`
- Create: `app/konto/page.tsx`

**Kontrakt — `components/LogoutButton.tsx`:** `"use client"`. En knap "Log ud" der kalder `signOut({ redirectTo: "/" })` fra `next-auth/react`. Stil efter retning B (fx `ghost`-variant-agtig).

**Kontrakt — `app/konto/page.tsx`:** Server Component. `const session = await auth()` — hvis ingen session, `redirect("/konto/login")` (middleware fanger det også, men dobbelt-tjek skader ikke). Vis: overskrift "Min konto", brugerens navn og email, et link til `/konto/ordrer` ("Se mine ordrer"), og `<LogoutButton />`. Stil efter retning B.

**Steps:**
- [ ] Step 1: Skriv `components/LogoutButton.tsx`.
- [ ] Step 2: Skriv `app/konto/page.tsx`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add account profile page with logout"`

---

### Task 7: Ordrehistorik + ordrer knyttet til bruger

**Files:**
- Create: `app/konto/ordrer/page.tsx`
- Modify: `app/checkout/actions.ts`

**Kontrakt — `app/checkout/actions.ts` ændring:** I `placeOrder`, før ordren oprettes: `const session = await auth()` — hvis der er en session, sæt `userId: session.user.id` på `Order`-create-data; ellers `userId: null` (gæstekøb, som nu). Intet andet i `placeOrder` ændres.

**Kontrakt — `app/konto/ordrer/page.tsx`:** Server Component. `const session = await auth()` — ingen session → `redirect("/konto/login")`. Hent brugerens ordrer: `prisma.order.findMany({ where: { userId: session.user.id }, include: { items: true }, orderBy: { createdAt: "desc" } })`. Vis: overskrift "Mine ordrer". For hver ordre: ordrenummer, dato (`createdAt`, dansk format), status, antal varer, total (`formatPriceDkk`), og et link til `/ordre/[id]` ("Se detaljer"). Hvis ingen ordrer: en venlig tom-tilstand med link til `/produkter`. Et link tilbage til `/konto`. Stil efter retning B.

**Steps:**
- [ ] Step 1: Modificér `app/checkout/actions.ts` — sæt `userId` på ordren.
- [ ] Step 2: Skriv `app/konto/ordrer/page.tsx`.
- [ ] Step 3: Verificér — `npx tsc --noEmit && npm run build && npm test`.
- [ ] Step 4: Commit — `git add -A && git commit -m "Add order history and attach orders to users"`

---

### Task 8: Header — login-tilstand

**Files:**
- Modify: `components/Header.tsx`

**Kontrakt:** Header er allerede en async Server Component. Tilføj `const session = await auth()`. Ved siden af kurv-ikonet: hvis `session` findes, vis et "Min konto"-link til `/konto` (gerne med et lille bruger-ikon, inline SVG); hvis ikke, vis et "Log ind"-link til `/konto/login`. Hold ændringen minimal — tilføj bare det ene link/element, omstrukturér ikke headeren. Stil konsistent med de eksisterende header-elementer.

**Steps:**
- [ ] Step 1: Modificér `components/Header.tsx`.
- [ ] Step 2: Verificér — `npx tsc --noEmit && npm run build`.
- [ ] Step 3: Commit — `git add -A && git commit -m "Show login state in header"`

---

## Self-Review

**1. Spec coverage (spec §6 konti + §10 fase 4):** Registrering ✓ (Task 2). Login ✓ (Task 1+3). Logout ✓ (Task 6). Beskyttet profilside ✓ (Task 4+6). Ordrehistorik ✓ (Task 7). Kurv-fletning ved login ✓ (Task 5). Auth.js-credentials ✓ (Task 1). Roller i session (forberedelse til Fase 5 admin) ✓ (Task 1).

**2. Placeholder scan:** `events.signIn` udelades bevidst i Task 1 og tilføjes i Task 5 — eksplicit beskrevet, ikke en mangel. Ingen øvrige placeholders.

**3. Type-konsistens:** `auth`/`signIn`/`signOut`/`handlers` fra `lib/auth.ts` (Task 1) bruges i Task 3, 4, 5, 6, 7, 8 + route-handler. `registerSchema`/`RegisterInput` (Task 2) bruges i `registerUser` (Task 2) og `RegisterForm` (Task 2). `mergeGuestCartIntoUser` (Task 5) kaldes fra `lib/auth.ts` (Task 5). `session.user.id`/`session.user.role` (Task 1 type-augmentering) bruges i Task 5, 6, 7. `auth()` bruges i `lib/cart.ts` (Task 5) og i pages (Task 2, 3, 6, 7, 8) og checkout-action (Task 7).

**4. Ambiguitet:** Cirkulær import mellem `lib/cart.ts` og `lib/auth.ts` — eksplicit håndteret med en fallback-løsning i Task 5. Auth.js v5 API-usikkerhed — Task 1 instruerer at tilpasse og rapportere. `useSearchParams` i `LoginForm` kræver `<Suspense>` — noteret i Task 3.

**Afhængighedsrækkefølge:** Task 1 (auth-fundament) først. 2, 3 afhænger af 1. 4 afhænger af 1. 5 afhænger af 1 (+ rører cart+auth). 6 afhænger af 1. 7 afhænger af 1. 8 afhænger af 1. Sekventiel eksekvering passer; Task 5 skal efter Task 1 men kan ligge hvor som helst efter — planen kører 1→8 i rækkefølge.
