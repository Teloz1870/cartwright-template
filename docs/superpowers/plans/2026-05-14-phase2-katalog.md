# solbrillen.dk — Fase 2: Katalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** En browsbar butiksfacade — forside, kategorisider, produktside og produktoversigt med søgning, filtre og sortering — i den visuelle retning B (bold sommer-lifestyle).

**Architecture:** Next.js 16 App Router. Sider er Server Components der henter via Prisma (`lib/db.ts`). Designsystemet defineres som Tailwind v4 `@theme`-tokens i `app/globals.css`. Genbrugelige komponenter i `components/`. Ren, testbar logik (prisformatering, filter-query-bygning) i `lib/`.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Prisma 6, Vitest.

**Forudsætning:** Fase 1 er merget til `main`. Prisma-modellen, `lib/db.ts`, `lib/products.ts` (`parseProductImages`) og seed-data (5 kategorier, 24 produkter) findes. Arbejd på en ny branch `build/phase2-katalog` (forgrenet fra `main`).

---

## Filstruktur (Fase 2)

| Fil | Ansvar |
|---|---|
| `app/globals.css` | Tailwind v4 `@theme` — designtokens for retning B |
| `components/Button.tsx` | Pille-formet knap-primitiv (variant: primary/dark/ghost) |
| `components/Header.tsx` | Sticky site-header: logo, kategori-nav, søgelink, kurv-badge (placeholder) |
| `components/Footer.tsx` | Site-footer |
| `components/ProductCard.tsx` | Produktkort: billede, navn, brand, pris, "udsolgt"-mærke |
| `components/ProductGrid.tsx` | Responsivt grid af `ProductCard` |
| `lib/format.ts` | `formatPriceDkk(øre)` → "299 kr" |
| `lib/catalog.ts` | `buildProductQuery(params)` — oversætter søge/filter/sort-params til et Prisma `where`/`orderBy`-objekt |
| `app/layout.tsx` | Tilføj `Header` + `Footer` rundt om `children` |
| `app/page.tsx` | Forside: hero (retning B), fremhævede produkter, kategori-fliser |
| `app/kategori/[slug]/page.tsx` | Kategoriside: produkter i kategorien |
| `app/produkt/[slug]/page.tsx` | Produktside: billeder, pris, beskrivelse, attributter, lager, "læg i kurv"-placeholder, relaterede produkter |
| `app/produkter/page.tsx` | Produktoversigt: søgning, filtre, sortering |
| `components/CatalogFilters.tsx` | Filter-/sorterings-UI (client component, opdaterer URL-søgeparametre) |
| `tests/unit/format.test.ts` | Tests for `formatPriceDkk` |
| `tests/unit/catalog.test.ts` | Tests for `buildProductQuery` |

---

## Designtokens — visuel retning B (bold sommer-lifestyle)

Disse bruges konsekvent i hele fasen. Defineres i `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-sol-accent: #ff5a3c;   /* varm orange-rød — primær */
  --color-sol-sun: #ffb13c;      /* solgul — sekundær */
  --color-sol-cream: #fff3d6;    /* cremet baggrund */
  --color-sol-ink: #1c1c1c;      /* næsten-sort tekst */
  --color-sol-muted: #6b6357;    /* dæmpet tekst */
  --font-weight-black: 900;
  --radius-pill: 9999px;
}

body {
  background-color: var(--color-sol-cream);
  color: var(--color-sol-ink);
}
```

Stilprincipper: store, fede (font-weight 900) overskrifter; pille-formede knapper (`rounded-full`); hero med gradient `linear-gradient(120deg, #ff5a3c, #ffb13c)`; varme, runde kort. Billeder via `next/image` (tilføj `images.unsplash.com` til `next.config.ts` `images.remotePatterns`).

---

### Task 1: Designsystem-fundament + Button-primitiv

**Files:**
- Modify: `app/globals.css`
- Modify: `next.config.ts`
- Create: `components/Button.tsx`

- [ ] **Step 1: Skriv designtokens i `app/globals.css`**

Overskriv `app/globals.css` med præcis indholdet i "Designtokens"-blokken ovenfor (inkl. `@import "tailwindcss";`, `@theme`-blokken og `body`-reglen).

- [ ] **Step 2: Tillad Unsplash-billeder i `next.config.ts`**

Modify `next.config.ts` — tilføj `images.remotePatterns` for `images.unsplash.com`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 3: Skriv Button-komponenten**

Create `components/Button.tsx`:
```tsx
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sol-accent text-white hover:brightness-95",
  dark: "bg-sol-ink text-white hover:brightness-125",
  ghost: "bg-transparent text-sol-ink border border-sol-ink hover:bg-sol-ink hover:text-white",
};

const BASE =
  "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed";

type ButtonAsButton = { href?: undefined } & ComponentProps<"button"> & {
  variant?: Variant;
  children: ReactNode;
};
type ButtonAsLink = { href: string } & {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", className = "", children } = props;
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`;
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }
  const { variant: _v, className: _c, children: _ch, ...rest } = props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Verificér**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npx tsc --noEmit && npm run build`
Expected: tsc clean, build "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add design system tokens (visual direction B) and Button primitive"
```

---

### Task 2: Prisformatering — `lib/format.ts` (TDD)

**Files:**
- Create: `lib/format.ts`
- Create: `tests/unit/format.test.ts`

- [ ] **Step 1: Skriv den fejlende test**

Create `tests/unit/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatPriceDkk } from "@/lib/format";

describe("formatPriceDkk", () => {
  it("formaterer hele kroner uden øredel", () => {
    expect(formatPriceDkk(29900)).toBe("299 kr");
  });
  it("formaterer beløb med tusindtalsseparator", () => {
    expect(formatPriceDkk(129900)).toBe("1.299 kr");
  });
  it("viser ører når beløbet ikke er helt", () => {
    expect(formatPriceDkk(29950)).toBe("299,50 kr");
  });
  it("håndterer nul", () => {
    expect(formatPriceDkk(0)).toBe("0 kr");
  });
});
```

- [ ] **Step 2: Kør testen, bekræft den fejler**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm test`
Expected: FAIL — "Cannot find module '@/lib/format'".

- [ ] **Step 3: Skriv implementationen**

Create `lib/format.ts`:
```ts
/** Formaterer et beløb i øre til en dansk prisstreng, fx 29900 → "299 kr". */
export function formatPriceDkk(oere: number): string {
  const kroner = oere / 100;
  const harOerer = oere % 100 !== 0;
  const formatted = new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: harOerer ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(kroner);
  return `${formatted} kr`;
}
```

- [ ] **Step 4: Kør testen, bekræft den passerer**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm test`
Expected: PASS — alle tests (Fase 1's 3 + disse 4 = 7) passerer.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add formatPriceDkk currency helper with tests"
```

---

### Task 3: Filter-query-bygger — `lib/catalog.ts` (TDD)

**Files:**
- Create: `lib/catalog.ts`
- Create: `tests/unit/catalog.test.ts`

**Kontrakt:** `buildProductQuery` tager et almindeligt objekt af URL-søgeparametre (alle valgfrie strenge) og returnerer `{ where, orderBy }` klar til `prisma.product.findMany`.

Understøttede params: `q` (fritekst på navn ELLER brand, case-insensitivt), `kategori` (Category.slug), `stelfarve` (Product.frameColor), `glasfarve` (Product.lensColor), `brand` (Product.brand), `minPris` / `maxPris` (kroner, konverteres til øre), `sort` (`pris-op` | `pris-ned` | `nyeste`; default `nyeste`).

- [ ] **Step 1: Skriv den fejlende test**

Create `tests/unit/catalog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildProductQuery } from "@/lib/catalog";

describe("buildProductQuery", () => {
  it("returnerer tomt where og nyeste-sortering uden params", () => {
    const { where, orderBy } = buildProductQuery({});
    expect(where).toEqual({});
    expect(orderBy).toEqual({ createdAt: "desc" });
  });

  it("søger på navn eller brand for q", () => {
    const { where } = buildProductQuery({ q: "skagen" });
    expect(where).toEqual({
      OR: [
        { name: { contains: "skagen" } },
        { brand: { contains: "skagen" } },
      ],
    });
  });

  it("filtrerer på kategori-slug via relation", () => {
    const { where } = buildProductQuery({ kategori: "herre" });
    expect(where).toEqual({ category: { slug: "herre" } });
  });

  it("filtrerer på stelfarve, glasfarve og brand", () => {
    const { where } = buildProductQuery({
      stelfarve: "Sort",
      glasfarve: "Brun",
      brand: "Solir",
    });
    expect(where).toEqual({ frameColor: "Sort", lensColor: "Brun", brand: "Solir" });
  });

  it("konverterer prisinterval fra kroner til øre", () => {
    const { where } = buildProductQuery({ minPris: "300", maxPris: "800" });
    expect(where).toEqual({ priceDkk: { gte: 30000, lte: 80000 } });
  });

  it("ignorerer ugyldige prisværdier", () => {
    const { where } = buildProductQuery({ minPris: "abc" });
    expect(where).toEqual({});
  });

  it("oversætter sort-værdier", () => {
    expect(buildProductQuery({ sort: "pris-op" }).orderBy).toEqual({ priceDkk: "asc" });
    expect(buildProductQuery({ sort: "pris-ned" }).orderBy).toEqual({ priceDkk: "desc" });
    expect(buildProductQuery({ sort: "nyeste" }).orderBy).toEqual({ createdAt: "desc" });
  });

  it("kombinerer flere filtre", () => {
    const { where } = buildProductQuery({ kategori: "dame", brand: "Bølge", minPris: "500" });
    expect(where).toEqual({
      category: { slug: "dame" },
      brand: "Bølge",
      priceDkk: { gte: 50000 },
    });
  });
});
```

- [ ] **Step 2: Kør testen, bekræft den fejler**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm test`
Expected: FAIL — "Cannot find module '@/lib/catalog'".

- [ ] **Step 3: Skriv implementationen**

Create `lib/catalog.ts`:
```ts
export type CatalogParams = {
  q?: string;
  kategori?: string;
  stelfarve?: string;
  glasfarve?: string;
  brand?: string;
  minPris?: string;
  maxPris?: string;
  sort?: string;
};

export type ProductQuery = {
  where: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
};

function parseKroner(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** Oversætter URL-søgeparametre til et Prisma where/orderBy-objekt for produkter. */
export function buildProductQuery(params: CatalogParams): ProductQuery {
  const where: Record<string, unknown> = {};

  if (params.q && params.q.trim() !== "") {
    const term = params.q.trim();
    where.OR = [
      { name: { contains: term } },
      { brand: { contains: term } },
    ];
  }
  if (params.kategori) where.category = { slug: params.kategori };
  if (params.stelfarve) where.frameColor = params.stelfarve;
  if (params.glasfarve) where.lensColor = params.glasfarve;
  if (params.brand) where.brand = params.brand;

  const min = parseKroner(params.minPris);
  const max = parseKroner(params.maxPris);
  if (min !== undefined || max !== undefined) {
    const price: Record<string, number> = {};
    if (min !== undefined) price.gte = min;
    if (max !== undefined) price.lte = max;
    where.priceDkk = price;
  }

  let orderBy: Record<string, "asc" | "desc">;
  switch (params.sort) {
    case "pris-op":
      orderBy = { priceDkk: "asc" };
      break;
    case "pris-ned":
      orderBy = { priceDkk: "desc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  return { where, orderBy };
}
```

- [ ] **Step 4: Kør testen, bekræft den passerer**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npm test`
Expected: PASS — alle tests passerer (Fase 1+2 = 15 i alt).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add buildProductQuery catalog filter helper with tests"
```

---

### Task 4: ProductCard + ProductGrid

**Files:**
- Create: `components/ProductCard.tsx`
- Create: `components/ProductGrid.tsx`

**Kontrakt:** `ProductCard` modtager en `product`-prop (et Prisma `Product`-objekt). Den viser: første billede (via `next/image`, `parseProductImages` fra `lib/products.ts`), produktnavn, brand, formateret pris (`formatPriceDkk`), og et "Udsolgt"-mærke hvis `stock === 0`. Hele kortet er et `Link` til `/produkt/[slug]`. Stil: retning B — cremet/hvidt kort, `rounded-2xl`, blødt skygge, billede i `aspect-square`, fed (font-black) produktnavn, accent-farvet pris. Hover: kortet løftes let.

`ProductGrid` modtager `products`-prop (array) og rendrer dem i et responsivt grid (1 kolonne mobil, 2 small, 3 medium, 4 large) med `gap-6`. Viser en venlig dansk besked ("Ingen produkter fundet.") hvis arrayet er tomt.

- [ ] **Step 1: Skriv `components/ProductCard.tsx`**

Implementér efter kontrakten. Importér `parseProductImages` fra `@/lib/products` og `formatPriceDkk` fra `@/lib/format`. Brug Prisma-typen: `import type { Product } from "@prisma/client"`. Billede-`alt` = produktnavn. Hvis `parseProductImages` giver tomt array, vis en neutral pladsholder-baggrund (fx `bg-sol-sun/30`) i stedet for `next/image`.

- [ ] **Step 2: Skriv `components/ProductGrid.tsx`**

Implementér efter kontrakten. Tager `products: Product[]`.

- [ ] **Step 3: Verificér**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npx tsc --noEmit`
Expected: clean. (Komponenterne bruges endnu ikke — næste tasks bruger dem.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add ProductCard and ProductGrid components"
```

---

### Task 5: Header + Footer + layout

**Files:**
- Create: `components/Header.tsx`
- Create: `components/Footer.tsx`
- Modify: `app/layout.tsx`

**Kontrakt — Header:** Sticky top-header i retning B. Venstre: "solbrillen.dk"-logo (fed, `font-black`, link til `/`). Midt/højre: navigationslinks til de 5 kategorier (hentes server-side fra Prisma: `prisma.category.findMany`) som links til `/kategori/[slug]`, plus et link "Alle solbriller" til `/produkter`. Yderst til højre: et søge-ikon-link til `/produkter` og et kurv-ikon med et badge der viser "0" (placeholder — rigtig optælling kommer i Fase 3). Header er en async Server Component (den henter kategorier). Mobil: kategori-nav må gerne kollapse til en simpel vandret scrollbar række — hold det enkelt, ingen JavaScript-burgermenu nødvendig i denne fase.

**Kontrakt — Footer:** Enkel footer med "© 2026 solbrillen.dk", en linje "Pitch/demo — ikke en rigtig butik", og links til kategorierne. Statisk, ingen data.

**layout.tsx:** Indsæt `<Header />` før `{children}` og `<Footer />` efter, inde i `<body>`. `{children}` wrappes i `<main className="min-h-[60vh]">`.

- [ ] **Step 1: Skriv `components/Header.tsx`** efter kontrakten. Brug `prisma` fra `@/lib/db`. Brug inline SVG til søge- og kurv-ikoner (ingen ikon-bibliotek).

- [ ] **Step 2: Skriv `components/Footer.tsx`** efter kontrakten.

- [ ] **Step 3: Modify `app/layout.tsx`** — importér og indsæt `Header`/`Footer` rundt om `<main>{children}</main>`. Bevar den eksisterende `lang="da"` og `metadata`.

- [ ] **Step 4: Verificér**

Run: `cd /Users/kennimadsen/Documents/solbrillen.dk && npx tsc --noEmit && npm run build`
Expected: tsc clean, build OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Header, Footer and wire them into the root layout"
```

---

### Task 6: Forside

**Files:**
- Modify: `app/page.tsx`

**Kontrakt:** Forsiden (Server Component) erstatter den scaffold-genererede side helt. Sektioner, oppefra og ned:
1. **Hero** — fuldbredde, baggrund `linear-gradient(120deg,#ff5a3c,#ffb13c)`, hvid tekst: stor `font-black` overskrift ("Sommeren starter her"), kort underrubrik, og en `Button` (variant primary på mørk, eller dark) der linker til `/produkter` ("Find dine solbriller").
2. **Fremhævede produkter** — overskrift "Mest populære", henter `prisma.product.findMany({ where: { featured: true }, take: 8 })` og viser dem i `ProductGrid`.
3. **Kategori-fliser** — overskrift "Shop efter kategori", henter alle kategorier og viser dem som klikbare fliser (link til `/kategori/[slug]`) i et grid; hver flise i en varm farve fra paletten med kategorinavnet i `font-black`.

- [ ] **Step 1: Skriv `app/page.tsx`** efter kontrakten. Brug `prisma` fra `@/lib/db`, `ProductGrid`, `Button`.

- [ ] **Step 2: Verificér** — `npx tsc --noEmit && npm run build`. Build skal generere `/` uden fejl.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Build homepage with hero, featured products and category tiles"
```

---

### Task 7: Kategoriside

**Files:**
- Create: `app/kategori/[slug]/page.tsx`

**Kontrakt:** Dynamisk Server Component-side. Henter kategorien via `prisma.category.findUnique({ where: { slug } })` — kald `notFound()` (fra `next/navigation`) hvis den ikke findes. Henter kategoriens produkter (`prisma.product.findMany({ where: { categoryId }, orderBy: { createdAt: "desc" } })`). Viser: kategorititlen som stor `font-black` overskrift i et farvet bånd, antal produkter, og produkterne i `ProductGrid`. I Next.js 16 er `params` en `Promise` — typen er `{ params: Promise<{ slug: string }> }` og skal `await`es. Tilføj `generateMetadata` der sætter sidetitlen til kategorinavnet.

- [ ] **Step 1: Skriv `app/kategori/[slug]/page.tsx`** efter kontrakten.

- [ ] **Step 2: Verificér** — `npx tsc --noEmit && npm run build`. Build skal kunne prerender de seedede kategori-slugs uden fejl (eller bygge dem dynamisk — begge dele OK).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add category page"
```

---

### Task 8: Produktside

**Files:**
- Create: `app/produkt/[slug]/page.tsx`

**Kontrakt:** Dynamisk Server Component-side. Henter produktet via `prisma.product.findUnique({ where: { slug }, include: { category: true } })` — `notFound()` hvis det ikke findes. Layout (to kolonner på desktop, stablet på mobil):
- **Venstre:** stort produktbillede (`next/image`, via `parseProductImages`; pladsholder hvis tomt).
- **Højre:** brand (lille, dæmpet), produktnavn (`font-black`, stor), pris (`formatPriceDkk`, accent-farvet, stor), beskrivelse, en attribut-liste (Kategori, Stelfarve, Glasfarve), lager-status ("På lager" hvis `stock > 0`, ellers "Udsolgt"), og en "Læg i kurv"-`Button` der er **disabled hvis `stock === 0`**. Knappen er en placeholder i denne fase (rigtig kurv-funktion kommer i Fase 3) — render den som en almindelig `<button>` uden onClick, eller med en `disabled`-tilstand; tilføj en lille note "Kurv-funktion kommer snart". Ingen client-interaktivitet kræves.
- Nederst: **relaterede produkter** — `prisma.product.findMany({ where: { categoryId: product.categoryId, id: { not: product.id } }, take: 4 })` i et `ProductGrid` under overskriften "Mere fra samme kategori".

`params` er en `Promise` (Next.js 16). Tilføj `generateMetadata` med produktnavnet som titel.

- [ ] **Step 1: Skriv `app/produkt/[slug]/page.tsx`** efter kontrakten.

- [ ] **Step 2: Verificér** — `npx tsc --noEmit && npm run build`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add product detail page with related products"
```

---

### Task 9: Produktoversigt med søgning, filtre og sortering

**Files:**
- Create: `app/produkter/page.tsx`
- Create: `components/CatalogFilters.tsx`

**Kontrakt — `app/produkter/page.tsx`:** Server Component. `searchParams` er en `Promise` i Next.js 16 — `await` den; typen er `{ searchParams: Promise<Record<string, string | string[] | undefined>> }`. Normalisér hver param til `string | undefined` (tag `[0]` hvis array) og byg et `CatalogParams`-objekt. Kald `buildProductQuery` (fra `@/lib/catalog`) og hent produkter med `prisma.product.findMany({ where, orderBy })`. Hent også, til filter-UI'et, de distinkte værdier: alle kategorier (`prisma.category.findMany`), og distinkte `brand` / `frameColor` / `lensColor` fra produkter (`prisma.product.findMany` + map til unikke værdier, eller `distinct`). Layout: en `font-black`-sideoverskrift "Alle solbriller", `CatalogFilters` (sidebar på desktop, øverst på mobil), og resultaterne i `ProductGrid` med en tæller ("X produkter").

**Kontrakt — `components/CatalogFilters.tsx`:** Client Component (`"use client"`). Modtager props: de tilgængelige kategorier, brands, stelfarver, glasfarver, og de nuværende valgte værdier. Rendrer:
- et søgefelt (`q`)
- select/radio for kategori
- select for brand, stelfarve, glasfarve
- to talfelter for `minPris` / `maxPris`
- en sorterings-`select` (`nyeste`, `pris-op`, `pris-ned`)
- en "Nulstil"-knap

Når brugeren ændrer noget, opdateres URL'ens søgeparametre via `useRouter` + `useSearchParams` fra `next/navigation` (`router.push("/produkter?" + new URLSearchParams(...))`) — det får serversiden til at re-rendre med nye filtre. Tomme værdier udelades fra URL'en. Stil efter retning B (pille-formede inputs/knapper, varme farver).

- [ ] **Step 1: Skriv `components/CatalogFilters.tsx`** efter kontrakten.

- [ ] **Step 2: Skriv `app/produkter/page.tsx`** efter kontrakten.

- [ ] **Step 3: Verificér** — `npx tsc --noEmit && npm run build && npm test` (alle 15 tests skal stadig passere).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add product listing page with search, filters and sorting"
```

---

## Self-Review

**1. Spec coverage (Fase 2 fra spec §6 + §10 fase 2):** Designsystem retning B ✓ (Task 1). Forside med fremhævede produkter + kategorier ✓ (Task 6). Kategorisider ✓ (Task 7). Produktside med relaterede produkter ✓ (Task 8). Produktoversigt ✓ (Task 9). Søgning + filtrering (kategori, farve, pris, brand) + sortering ✓ (Task 3 logik + Task 9 UI). Header/Footer/navigation ✓ (Task 5). Prisformatering ✓ (Task 2).

**2. Placeholder scan:** "Læg i kurv"-knappen på produktsiden er bevidst en ikke-funktionel placeholder i denne fase — det er eksplicit i kontrakten og dækkes af Fase 3, ikke en plan-mangel. Kurv-badge i header er ligeledes bevidst "0" indtil Fase 3. Ingen øvrige placeholders.

**3. Type-konsistens:** `formatPriceDkk(oere: number)` (Task 2) bruges i `ProductCard` (Task 4) og produktside (Task 8). `parseProductImages` (Fase 1) bruges i `ProductCard` (Task 4) og produktside (Task 8). `buildProductQuery` / `CatalogParams` (Task 3) bruges i `app/produkter/page.tsx` (Task 9). `Button` (Task 1) bruges i Task 6 + 8. `ProductGrid`/`ProductCard` (Task 4) bruges i Task 6, 7, 8, 9. Prisma `Product`-typen bruges konsekvent som komponent-prop.

**4. Ambiguitet:** Next.js 16's `params`/`searchParams`-som-`Promise` er eksplicit nævnt i Task 7, 8, 9. Tailwind v4 `@theme`-tilgang (ingen `tailwind.config.js`) er eksplicit i Task 1.

**Note:** Tasks 1-3 er uafhængige af hinanden og af resten; Task 4 afhænger af 1+2; Task 5 af 1; Task 6 af 1+4; Task 7+8 af 1+4; Task 9 af 1+3+4. Eksekveres sekventielt af subagent-driven-development.
