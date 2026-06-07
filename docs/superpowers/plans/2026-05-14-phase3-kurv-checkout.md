# solbrillen.dk — Fase 3: Kurv + Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** En fungerende købsrejse — gæstekurv, kurv-side, checkout med leveringsformular, fragtberegning, rabatkoder, lager-tjek, mock-betaling, ordreoprettelse, ordrebekræftelse og preview-e-mail.

**Architecture:** Next.js 16 App Router. Ren, testet forretningslogik (pris-, fragt-, rabatberegning og rabatkode-validering) i `lib/`. Kurv-datalag i `lib/cart.ts` (gæstekurv nøglet på en httpOnly session-cookie). Mutationer sker via **Server Actions** (Next.js 16-idiomet — en let forfining af spec'ens "api/cart/route.ts", som giver renere klient-kode uden fetch-boilerplate). Checkout opretter ordren i én Prisma-transaktion. Mock-betaling og preview-e-mail er bag interfaces så de kan udskiftes.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Prisma 6, Zod, Vitest.

**Forudsætning:** Fase 1+2 er merget til `main`. Datamodel (inkl. `Cart`, `CartItem`, `Order`, `OrderItem`, `DiscountCode`), `lib/db.ts`, `lib/format.ts` (`formatPriceDkk`), `lib/products.ts` (`parseProductImages`), designsystem og storefront findes. Arbejd på ny branch `build/phase3-kurv-checkout` (forgrenet fra `main`).

---

## Filstruktur (Fase 3)

| Fil | Ansvar |
|---|---|
| `lib/pricing.ts` | Rene funktioner: subtotal, fragt, rabatanvendelse, total |
| `lib/discount.ts` | Ren funktion: validér en rabatkode mod regler, beregn rabatbeløb |
| `lib/validation.ts` | Zod-skemaer (checkout-leveringsformular) |
| `lib/cart.ts` | Kurv-datalag: get-or-create kurv via session-cookie, add/update/remove, hent kurv med varer+produkter |
| `lib/mailer.ts` | `Mailer`-interface + `PreviewMailer` (skriver ordrebekræftelse som HTML-preview) |
| `app/cart/actions.ts` | Server Actions: `addToCart`, `updateCartItem`, `removeCartItem` |
| `app/checkout/actions.ts` | Server Action: `placeOrder` — validér, lager-tjek, opret ordre i transaktion |
| `components/AddToCartButton.tsx` | Client component — "Læg i kurv"-knap der kalder `addToCart` |
| `components/CartQuantity.tsx` | Client component — antals-stepper + fjern-knap der kalder cart-actions |
| `components/CheckoutForm.tsx` | Client component — leveringsformular + rabatkodefelt, kalder `placeOrder` |
| `app/kurv/page.tsx` | Kurv-side: varer, antal, fjern, ordresum, "til checkout" |
| `app/checkout/page.tsx` | Checkout-side: ordresummering + `CheckoutForm` |
| `app/ordre/[id]/page.tsx` | Ordrebekræftelse |
| `components/Header.tsx` | Modificér: kurv-badge viser rigtigt antal |
| `app/produkt/[slug]/page.tsx` | Modificér: erstat placeholder-knap med `AddToCartButton` |
| `tests/unit/pricing.test.ts` | Tests for `lib/pricing.ts` |
| `tests/unit/discount.test.ts` | Tests for `lib/discount.ts` |

---

## Forretningsregler (gælder hele fasen)

- **Fragt:** fast sats **49 kr** (4900 øre). **Gratis fragt** ved subtotal ≥ **499 kr** (49900 øre). Konstanter: `SHIPPING_FEE_OERE = 4900`, `FREE_SHIPPING_THRESHOLD_OERE = 49900`.
- **Rabat:** anvendes på **subtotal** (ikke fragt). `percent`-type: `Math.round(subtotal * value / 100)`. `fixed`-type: `value` øre, dog aldrig mere end subtotal. Rabat reducerer aldrig totalen under fragtbeløbet alene.
- **Total:** `total = subtotal - discount + shipping`. Fragt beregnes ud fra subtotal **før** rabat (rabat ændrer ikke fragt-tærsklen).
- **Rabatkode gyldig** hvis: `active === true` OG (`validUntil` er null ELLER `validUntil >= nu`) OG (`usageLimit` er null ELLER `usageCount < usageLimit`).
- **Lager:** ved checkout afvises ordren hvis nogen vare har `quantity > product.stock`.

---

### Task 1: Prisberegning — `lib/pricing.ts` (TDD)

**Files:**
- Create: `lib/pricing.ts`
- Create: `tests/unit/pricing.test.ts`

**Kontrakt:**
```ts
export const SHIPPING_FEE_OERE = 4900;
export const FREE_SHIPPING_THRESHOLD_OERE = 49900;

export type PriceLine = { unitPriceDkk: number; quantity: number };
export type DiscountInput = { type: "percent" | "fixed"; value: number } | null;
export type PriceBreakdown = {
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
};

export function calcSubtotal(lines: PriceLine[]): number;
export function calcShipping(subtotalDkk: number): number;
export function calcDiscount(subtotalDkk: number, discount: DiscountInput): number;
export function calcPriceBreakdown(lines: PriceLine[], discount: DiscountInput): PriceBreakdown;
```

- [ ] **Step 1: Skriv den fejlende test**

Create `tests/unit/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  calcSubtotal,
  calcShipping,
  calcDiscount,
  calcPriceBreakdown,
  SHIPPING_FEE_OERE,
} from "@/lib/pricing";

describe("calcSubtotal", () => {
  it("summerer linjer (pris × antal)", () => {
    expect(calcSubtotal([{ unitPriceDkk: 29900, quantity: 2 }, { unitPriceDkk: 10000, quantity: 1 }])).toBe(69800);
  });
  it("er 0 for tom kurv", () => {
    expect(calcSubtotal([])).toBe(0);
  });
});

describe("calcShipping", () => {
  it("opkræver fast fragt under tærsklen", () => {
    expect(calcShipping(10000)).toBe(SHIPPING_FEE_OERE);
  });
  it("er gratis ved eller over tærsklen (49900)", () => {
    expect(calcShipping(49900)).toBe(0);
    expect(calcShipping(60000)).toBe(0);
  });
  it("er fast fragt lige under tærsklen", () => {
    expect(calcShipping(49899)).toBe(SHIPPING_FEE_OERE);
  });
});

describe("calcDiscount", () => {
  it("er 0 uden rabat", () => {
    expect(calcDiscount(50000, null)).toBe(0);
  });
  it("beregner procent-rabat", () => {
    expect(calcDiscount(50000, { type: "percent", value: 10 })).toBe(5000);
  });
  it("runder procent-rabat", () => {
    expect(calcDiscount(29999, { type: "percent", value: 10 })).toBe(3000);
  });
  it("beregner fast rabat", () => {
    expect(calcDiscount(50000, { type: "fixed", value: 5000 })).toBe(5000);
  });
  it("begrænser fast rabat til subtotal", () => {
    expect(calcDiscount(3000, { type: "fixed", value: 5000 })).toBe(3000);
  });
});

describe("calcPriceBreakdown", () => {
  it("samler subtotal, rabat, fragt og total", () => {
    const lines = [{ unitPriceDkk: 20000, quantity: 1 }];
    const result = calcPriceBreakdown(lines, { type: "percent", value: 10 });
    expect(result).toEqual({
      subtotalDkk: 20000,
      discountDkk: 2000,
      shippingDkk: SHIPPING_FEE_OERE,
      totalDkk: 20000 - 2000 + SHIPPING_FEE_OERE,
    });
  });
  it("fragt beregnes ud fra subtotal før rabat", () => {
    // subtotal 49900 → gratis fragt, selv hvis rabat bringer beløbet ned
    const lines = [{ unitPriceDkk: 49900, quantity: 1 }];
    const result = calcPriceBreakdown(lines, { type: "fixed", value: 10000 });
    expect(result.shippingDkk).toBe(0);
    expect(result.totalDkk).toBe(49900 - 10000 + 0);
  });
  it("håndterer tom kurv uden rabat", () => {
    expect(calcPriceBreakdown([], null)).toEqual({
      subtotalDkk: 0,
      discountDkk: 0,
      shippingDkk: SHIPPING_FEE_OERE,
      totalDkk: SHIPPING_FEE_OERE,
    });
  });
});
```

- [ ] **Step 2: Kør testen, bekræft den fejler** — `cd /Users/kennimadsen/Documents/solbrillen.dk && npm test` → FAIL "Cannot find module '@/lib/pricing'".

- [ ] **Step 3: Skriv implementationen**

Create `lib/pricing.ts`:
```ts
export const SHIPPING_FEE_OERE = 4900;
export const FREE_SHIPPING_THRESHOLD_OERE = 49900;

export type PriceLine = { unitPriceDkk: number; quantity: number };
export type DiscountInput = { type: "percent" | "fixed"; value: number } | null;
export type PriceBreakdown = {
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
};

/** Summen af alle kurvlinjer i øre. */
export function calcSubtotal(lines: PriceLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceDkk * l.quantity, 0);
}

/** Fragt i øre: fast sats, gratis ved/over tærsklen. */
export function calcShipping(subtotalDkk: number): number {
  return subtotalDkk >= FREE_SHIPPING_THRESHOLD_OERE ? 0 : SHIPPING_FEE_OERE;
}

/** Rabatbeløb i øre, anvendt på subtotal — aldrig mere end subtotal. */
export function calcDiscount(subtotalDkk: number, discount: DiscountInput): number {
  if (!discount) return 0;
  const raw =
    discount.type === "percent"
      ? Math.round((subtotalDkk * discount.value) / 100)
      : discount.value;
  return Math.min(Math.max(raw, 0), subtotalDkk);
}

/** Fuld prisopdeling. Fragt beregnes ud fra subtotal FØR rabat. */
export function calcPriceBreakdown(
  lines: PriceLine[],
  discount: DiscountInput,
): PriceBreakdown {
  const subtotalDkk = calcSubtotal(lines);
  const discountDkk = calcDiscount(subtotalDkk, discount);
  const shippingDkk = calcShipping(subtotalDkk);
  const totalDkk = subtotalDkk - discountDkk + shippingDkk;
  return { subtotalDkk, discountDkk, shippingDkk, totalDkk };
}
```

- [ ] **Step 4: Kør testen, bekræft den passerer** — `npm test` → alle tests passerer (15 fra før + 14 nye = 29).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add pricing calculation helpers with tests"`

---

### Task 2: Rabatkode-validering — `lib/discount.ts` (TDD)

**Files:**
- Create: `lib/discount.ts`
- Create: `tests/unit/discount.test.ts`

**Kontrakt:**
```ts
export type DiscountCodeRecord = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  validUntil: Date | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
};
export type DiscountValidation =
  | { ok: true; type: "percent" | "fixed"; value: number }
  | { ok: false; reason: string };

/** Validerer en rabatkode-record mod reglerne. `now` injiceres for testbarhed. */
export function validateDiscountCode(
  record: DiscountCodeRecord | null,
  now: Date,
): DiscountValidation;
```
Regler: `record` null → `{ ok:false, reason:"Ukendt rabatkode" }`. `active===false` → `{ ok:false, reason:"Rabatkoden er ikke aktiv" }`. `validUntil` sat og `< now` → `{ ok:false, reason:"Rabatkoden er udløbet" }`. `usageLimit` sat og `usageCount >= usageLimit` → `{ ok:false, reason:"Rabatkoden er opbrugt" }`. Ellers `{ ok:true, type, value }`.

- [ ] **Step 1: Skriv den fejlende test**

Create `tests/unit/discount.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateDiscountCode } from "@/lib/discount";

const NOW = new Date("2026-05-14T12:00:00Z");
const base = {
  code: "SOMMER10",
  type: "percent" as const,
  value: 10,
  validUntil: null,
  usageLimit: null,
  usageCount: 0,
  active: true,
};

describe("validateDiscountCode", () => {
  it("afviser ukendt kode", () => {
    expect(validateDiscountCode(null, NOW)).toEqual({ ok: false, reason: "Ukendt rabatkode" });
  });
  it("accepterer en gyldig kode", () => {
    expect(validateDiscountCode(base, NOW)).toEqual({ ok: true, type: "percent", value: 10 });
  });
  it("afviser inaktiv kode", () => {
    expect(validateDiscountCode({ ...base, active: false }, NOW)).toEqual({
      ok: false,
      reason: "Rabatkoden er ikke aktiv",
    });
  });
  it("afviser udløbet kode", () => {
    expect(
      validateDiscountCode({ ...base, validUntil: new Date("2026-05-01T00:00:00Z") }, NOW),
    ).toEqual({ ok: false, reason: "Rabatkoden er udløbet" });
  });
  it("accepterer kode der udløber i fremtiden", () => {
    expect(
      validateDiscountCode({ ...base, validUntil: new Date("2026-12-01T00:00:00Z") }, NOW),
    ).toEqual({ ok: true, type: "percent", value: 10 });
  });
  it("afviser opbrugt kode", () => {
    expect(
      validateDiscountCode({ ...base, usageLimit: 5, usageCount: 5 }, NOW),
    ).toEqual({ ok: false, reason: "Rabatkoden er opbrugt" });
  });
  it("accepterer kode under forbrugsgrænsen", () => {
    expect(
      validateDiscountCode({ ...base, usageLimit: 5, usageCount: 4 }, NOW),
    ).toEqual({ ok: true, type: "percent", value: 10 });
  });
});
```

- [ ] **Step 2: Kør testen, bekræft den fejler** — `npm test` → FAIL "Cannot find module '@/lib/discount'".

- [ ] **Step 3: Skriv implementationen**

Create `lib/discount.ts`:
```ts
export type DiscountCodeRecord = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  validUntil: Date | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
};
export type DiscountValidation =
  | { ok: true; type: "percent" | "fixed"; value: number }
  | { ok: false; reason: string };

/** Validerer en rabatkode-record mod reglerne. `now` injiceres for testbarhed. */
export function validateDiscountCode(
  record: DiscountCodeRecord | null,
  now: Date,
): DiscountValidation {
  if (!record) return { ok: false, reason: "Ukendt rabatkode" };
  if (!record.active) return { ok: false, reason: "Rabatkoden er ikke aktiv" };
  if (record.validUntil && record.validUntil < now) {
    return { ok: false, reason: "Rabatkoden er udløbet" };
  }
  if (record.usageLimit !== null && record.usageCount >= record.usageLimit) {
    return { ok: false, reason: "Rabatkoden er opbrugt" };
  }
  return { ok: true, type: record.type, value: record.value };
}
```

- [ ] **Step 4: Kør testen, bekræft den passerer** — `npm test` → alle tests passerer (29 + 7 = 36).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add discount code validation helper with tests"`

---

### Task 3: Kurv-datalag — `lib/cart.ts`

**Files:**
- Create: `lib/cart.ts`

**Kontrakt:** Server-side modul (`import "server-only"` øverst). Gæstekurv identificeres af en httpOnly-cookie `kurv_session` (en `crypto.randomUUID()`-værdi). Funktioner:
- `getCartSessionId(): Promise<string | null>` — læser cookien (returnerer null hvis ingen).
- `getOrCreateCart(): Promise<Cart med items+product>` — læser cookien; hvis ingen, generér uuid, sæt cookien (httpOnly, sameSite lax, 30 dages levetid), og opret en `Cart`-række. Returnér kurven med `items: { include: { product: true } }`.
- `getCart(): Promise<Cart med items+product | null>` — som ovenfor men opretter IKKE (returnerer null hvis ingen cookie/kurv). Bruges til read-only steder (header-badge, kurv-side).
- `addItem(productId: string, quantity = 1): Promise<void>` — get-or-create kurv; upsert `CartItem` (hvis varen findes, læg `quantity` til; ellers opret). `@@unique([cartId, productId])` understøtter upsert.
- `updateItemQuantity(cartItemId: string, quantity: number): Promise<void>` — hvis `quantity <= 0`, slet linjen; ellers sæt antal. Verificér at linjen tilhører den aktuelle session-kurv før ændring.
- `removeItem(cartItemId: string): Promise<void>` — slet linjen (efter samme ejerskabs-tjek).
- `getCartCount(): Promise<number>` — summen af `quantity` over kurvens linjer (0 hvis ingen kurv).

Brug `cookies()` fra `next/headers` (i Next.js 16 er `cookies()` async — `await cookies()`). Brug `prisma` fra `@/lib/db`.

- [ ] **Step 1: Skriv `lib/cart.ts`** efter kontrakten.
- [ ] **Step 2: Verificér** — `npx tsc --noEmit` (clean). `npm run build` (OK). Modulet bruges af senere tasks.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "Add cart data layer with guest session cookie"`

---

### Task 4: Cart Server Actions + integration

**Files:**
- Create: `app/cart/actions.ts`
- Create: `components/AddToCartButton.tsx`
- Modify: `components/Header.tsx`
- Modify: `app/produkt/[slug]/page.tsx`

**Kontrakt — `app/cart/actions.ts`:** `"use server"` øverst. Eksportér Server Actions der wrapper `lib/cart.ts`:
- `addToCartAction(productId: string)` — kalder `addItem(productId, 1)`, så `revalidatePath("/kurv")` og `revalidatePath("/")` (eller blot `revalidatePath`-de relevante stier) så header-badge/kurv opdateres.
- `updateCartItemAction(cartItemId: string, quantity: number)` — kalder `updateItemQuantity`, revaliderer `/kurv`.
- `removeCartItemAction(cartItemId: string)` — kalder `removeItem`, revaliderer `/kurv`.

**Kontrakt — `components/AddToCartButton.tsx`:** `"use client"`. Props: `{ productId: string; disabled?: boolean }`. Renderer en pille-knap "Læg i kurv" i retning B (`bg-sol-accent`). Ved klik kalder den `addToCartAction(productId)` (importeret fra `app/cart/actions`), viser kort en "Lagt i kurv ✓"-tilstand i ~2 sek via `useState`/`useTransition`. `disabled`-prop deaktiverer knappen (bruges når `stock === 0`).

**Header.tsx:** Erstat den hardcodede "0" i kurv-badget med det rigtige tal fra `getCartCount()` (Header er allerede en async Server Component). Hvis tallet er 0, vis enten "0" eller skjul badget — vis "0" for enkelhed.

**produkt/[slug]/page.tsx:** Erstat placeholder-`<button>` "Læg i kurv" med `<AddToCartButton productId={product.id} disabled={product.stock === 0} />`. Fjern "Kurv-funktion kommer snart"-noten.

- [ ] **Step 1: Skriv `app/cart/actions.ts`.**
- [ ] **Step 2: Skriv `components/AddToCartButton.tsx`.**
- [ ] **Step 3: Modificér `components/Header.tsx`** — rigtigt kurv-antal.
- [ ] **Step 4: Modificér `app/produkt/[slug]/page.tsx`** — brug `AddToCartButton`.
- [ ] **Step 5: Verificér** — `npx tsc --noEmit && npm run build`. Build OK.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "Wire up add-to-cart with server actions and live cart badge"`

---

### Task 5: Kurv-side — `app/kurv/page.tsx` + `CartQuantity`

**Files:**
- Create: `components/CartQuantity.tsx`
- Create: `app/kurv/page.tsx`

**Kontrakt — `components/CartQuantity.tsx`:** `"use client"`. Props: `{ cartItemId: string; quantity: number; max: number }` (`max` = produktets lager). Renderer en `−` / antal / `+` stepper og en "Fjern"-knap. `+` kalder `updateCartItemAction(cartItemId, quantity+1)` (deaktiveret når `quantity >= max`). `−` kalder `updateCartItemAction(cartItemId, quantity-1)`. "Fjern" kalder `removeCartItemAction(cartItemId)`. Brug `useTransition` for pending-tilstand.

**Kontrakt — `app/kurv/page.tsx`:** Server Component. Henter kurven via `getCart()` fra `lib/cart.ts`. Hvis kurven er tom (eller null), vis en venlig tom-tilstand med et link til `/produkter`. Ellers: en liste af kurvlinjer (hver med produktbillede via `parseProductImages`, navn (link til produktside), enhedspris, `CartQuantity`-stepper, linjesum), og en ordresummering der bruger `calcPriceBreakdown` (fra `lib/pricing.ts`, uden rabat her — rabat indtastes på checkout) til at vise subtotal, fragt og total med `formatPriceDkk`. En "Gå til checkout"-`Button` (link til `/checkout`). En note om at lager kan begrænse antal. Stil efter retning B.

- [ ] **Step 1: Skriv `components/CartQuantity.tsx`.**
- [ ] **Step 2: Skriv `app/kurv/page.tsx`.**
- [ ] **Step 3: Verificér** — `npx tsc --noEmit && npm run build`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "Add cart page with quantity steppers and order summary"`

---

### Task 6: Preview-mailer — `lib/mailer.ts`

**Files:**
- Create: `lib/mailer.ts`
- Modify: `.gitignore` (tilføj `.mail-previews/`)

**Kontrakt:** `import "server-only"`. Definér:
```ts
export type OrderEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  items: { productName: string; quantity: number; unitPriceDkk: number }[];
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
};
export interface Mailer {
  sendOrderConfirmation(data: OrderEmailData): Promise<void>;
}
```
`renderOrderConfirmationHtml(data: OrderEmailData): string` — ren funktion der bygger en simpel, pæn HTML-e-mail (dansk, retning B-agtige farver inline) med ordrenummer, varelinjer, beløb formateret via `formatPriceDkk`. Eksportér den (så den kan genbruges/tests senere).
`PreviewMailer implements Mailer` — `sendOrderConfirmation` skriver HTML'en til `.mail-previews/ordre-<orderId>.html` (opret mappen hvis den mangler, brug `fs/promises`) og `console.log`'er stien. Ingen rigtig afsendelse.
Eksportér en singleton `export const mailer: Mailer = new PreviewMailer();`.

- [ ] **Step 1: Skriv `lib/mailer.ts`** efter kontrakten.
- [ ] **Step 2: Tilføj `.mail-previews/` til `.gitignore`.**
- [ ] **Step 3: Verificér** — `npx tsc --noEmit && npm run build`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "Add PreviewMailer for order confirmation emails"`

---

### Task 7: Zod-skema + Checkout-side + CheckoutForm

**Files:**
- Create: `lib/validation.ts`
- Create: `components/CheckoutForm.tsx`
- Create: `app/checkout/page.tsx`

**Kontrakt — `lib/validation.ts`:** Eksportér et Zod-skema `checkoutSchema` med felter: `shippingName` (min 2), `email` (gyldig email), `shippingAddress` (min 3), `shippingZip` (4 cifre — `/^\d{4}$/`), `shippingCity` (min 2), `discountCode` (valgfri streng, må være tom). Eksportér den udledte type `CheckoutInput`. Danske fejlbeskeder.

**Kontrakt — `components/CheckoutForm.tsx`:** `"use client"`. Renderer leveringsformularen (navn, email, adresse, postnr, by) + et valgfrit rabatkodefelt. Ved submit kalder den `placeOrder`-Server Action (fra `app/checkout/actions.ts`, lavet i Task 8) med formdata. `placeOrder` returnerer enten `{ ok: true, orderId }` eller `{ ok: false, error }`. Ved succes: `router.push("/ordre/" + orderId)`. Ved fejl: vis fejlbeskeden (dansk) over formularen. Klient-side: brug `checkoutSchema` til at vise feltfejl før submit (eller bare lad serveren validere og vis dens fejl — enten er ok; hold det enkelt). Brug `useTransition` for pending. Stil efter retning B.

**Kontrakt — `app/checkout/page.tsx`:** Server Component. Henter kurven via `getCart()`. Hvis tom → redirect/link til `/produkter` med besked. Ellers: vis en ordresummering (varelinjer + subtotal + fragt fra `calcPriceBreakdown`) ved siden af `CheckoutForm`. Send kurvens linjer/summer til `CheckoutForm` som props så den kan vise totalen (rabat anvendes server-side ved `placeOrder`, men formularen må gerne vise subtotal/fragt).

- [ ] **Step 1: Skriv `lib/validation.ts`.**
- [ ] **Step 2: Skriv `components/CheckoutForm.tsx`** (importér `placeOrder` fra `@/app/checkout/actions` — den fil oprettes i Task 8; for at Task 7 kan bygge alene, opret i Task 8 først ELLER lav en midlertidig stub. **For at undgå rækkefølge-problemer: Task 8 udføres FØR denne tasks Step 2-3 hvis nødvendigt — men da subagent-driven kører sekventielt, omarrangeres ikke; i stedet: i Task 7 importeres `placeOrder` med en type-only forventning, og Task 8 opretter filen. Hvis `npm run build` i Task 7 fejler pga. manglende `app/checkout/actions.ts`, opret da en minimal stub `export async function placeOrder() { return { ok: false as const, error: "ikke implementeret" }; }` og Task 8 erstatter den.**)
- [ ] **Step 3: Skriv `app/checkout/page.tsx`.**
- [ ] **Step 4: Verificér** — `npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add checkout page, form and validation schema"`

---

### Task 8: Checkout Server Action — ordreoprettelse

**Files:**
- Create eller Replace: `app/checkout/actions.ts`

**Kontrakt:** `"use server"`. Eksportér `placeOrder(formData: FormData): Promise<{ ok: true; orderId: string } | { ok: false; error: string }>`.
Flow:
1. Parse `formData` med `checkoutSchema` (fra `lib/validation.ts`). Ved Zod-fejl → `{ ok: false, error: <første fejlbesked> }`.
2. Hent kurven via `getCart()`. Hvis tom/null → `{ ok: false, error: "Din kurv er tom" }`.
3. **Lager-tjek:** for hver kurvlinje, hvis `quantity > product.stock` → `{ ok: false, error: "<produktnavn> har ikke nok på lager" }`.
4. **Rabatkode:** hvis et kodefelt er udfyldt, slå koden op (`prisma.discountCode.findUnique` — uppercase-trim koden), validér med `validateDiscountCode(record, new Date())`. Ved `ok:false` → returnér `{ ok:false, error: reason }`. Ved `ok:true` → brug den til rabatberegning.
5. Beregn `calcPriceBreakdown(lines, discount)`.
6. **Transaktion** (`prisma.$transaction`): opret `Order` (status `"paid"` — mock-betaling lykkes altid) med snapshot-felter og leveringsinfo; opret `OrderItem`-rækker med `productName`/`unitPriceDkk`-snapshots; dekrementér hvert produkts `stock` med linjens `quantity`; hvis rabatkode brugt, `usageCount++`; slet kurvens `CartItem`-rækker (tøm kurven).
7. Mock-betaling: en lille intern `async function processMockPayment(): Promise<{ success: true }>` der altid lykkes — kald den før/efter transaktionen (det er en demo).
8. Efter transaktion: `await mailer.sendOrderConfirmation({...})` (fra `lib/mailer.ts`).
9. `revalidatePath("/kurv")`, `revalidatePath("/")`. Returnér `{ ok: true, orderId }`.

Hvis Task 7 lavede en stub-fil, erstattes hele filen her.

- [ ] **Step 1: Skriv `app/checkout/actions.ts`** efter kontrakten.
- [ ] **Step 2: Verificér** — `npx tsc --noEmit && npm run build && npm test` (36 tests stadig grønne).
- [ ] **Step 3: Commit** — `git add -A && git commit -m "Add placeOrder checkout action with stock check and order transaction"`

---

### Task 9: Ordrebekræftelse — `app/ordre/[id]/page.tsx`

**Files:**
- Create: `app/ordre/[id]/page.tsx`

**Kontrakt:** Dynamisk Server Component. `params: Promise<{ id: string }>`. Henter ordren via `prisma.order.findUnique({ where: { id }, include: { items: true } })` — `notFound()` hvis null. Viser en venlig bekræftelse i retning B: stor "Tak for din ordre!"-overskrift, ordrenummer (`order.id`), leveringsadresse, varelinjer (`productName` × `quantity` à `unitPriceDkk`), subtotal/rabat/fragt/total med `formatPriceDkk`, og en note om at en bekræftelse er sendt til `order.email` (preview-mail). Et link tilbage til `/produkter`. `generateMetadata`: titel "Ordrebekræftelse".

- [ ] **Step 1: Skriv `app/ordre/[id]/page.tsx`.**
- [ ] **Step 2: Verificér** — `npx tsc --noEmit && npm run build`.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "Add order confirmation page"`

---

## Self-Review

**1. Spec coverage (spec §6 kurv/checkout/lager/e-mails + §10 fase 3):** Kurv (add/remove/justér, gæstekurv via cookie) ✓ (Task 3+4+5). Kurv-badge i header ✓ (Task 4). Checkout med leveringsinfo ✓ (Task 7). Zod-validering ✓ (Task 7). Fragtberegning ✓ (Task 1). Rabatkode ✓ (Task 2 validering + Task 8 anvendelse). Mock-betaling ✓ (Task 8). Ordreoprettelse i transaktion + lager-nedskrivning ✓ (Task 8). Lager-tjek ✓ (Task 8). Ordrebekræftelse ✓ (Task 9). Preview-e-mail ✓ (Task 6 + Task 8). Kurv-fletning ved login er Fase 4 (login findes ikke endnu) — bevidst udskudt, ikke en mangel her.

**2. Placeholder scan:** Den eneste bevidste midlertidighed er stub-muligheden i Task 7 Step 2, som Task 8 erstatter — eksplicit beskrevet. Ingen øvrige placeholders.

**3. Type-konsistens:** `calcPriceBreakdown`/`PriceLine`/`DiscountInput` (Task 1) bruges i Task 5, 7, 8. `validateDiscountCode`/`DiscountCodeRecord` (Task 2) bruges i Task 8. `lib/cart.ts`-funktioner (Task 3) bruges i Task 4, 5, 7, 8. Cart Server Actions (Task 4) bruges i `AddToCartButton` (Task 4) og `CartQuantity` (Task 5). `checkoutSchema`/`CheckoutInput` (Task 7) bruges i Task 8. `OrderEmailData`/`mailer` (Task 6) bruges i Task 8. `formatPriceDkk`/`parseProductImages` (Fase 2) bruges i Task 5, 7, 9.

**4. Ambiguitet:** Server Actions vs API-routes: bevidst valg af Server Actions, noteret i Architecture. Rabat anvendes på subtotal, fragt beregnes før rabat — eksplicit i Forretningsregler og testet i Task 1. `cookies()` er async i Next.js 16 — noteret i Task 3.

**Afhængighedsrækkefølge:** 1, 2 uafhængige (rene libs). 3 uafhængig (cart-lag). 4 afhænger af 3. 5 afhænger af 1+3+4. 6 uafhængig. 7 afhænger af 1+3 (+ stub for 8). 8 afhænger af 1+2+3+6+7. 9 afhænger af intet nyt. Sekventiel eksekvering passer.
