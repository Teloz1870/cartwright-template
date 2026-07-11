# Storefront Stripe Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vis Stripe Payment Element i storefront-checkout som et to-trin flow (form → betaling), så ordrer faktisk betales i stedet for at falde tilbage til mock.

**Architecture:** `placeOrder` server action returnerer discriminated union (`mode: "stripe" | "mock"`) i stedet for `redirect()`. `CheckoutForm` får `step`-state — ved Stripe-mode renderes eksisterende `StripePaymentPanel` inline med leveringssammendrag. `checkout/page.tsx` viser TEST-BUTIK-banner når `isStripeReady()=false`. Ingen ny komponent — alt eksisterer allerede, det kobles sammen.

**Tech Stack:** Next.js 16 App Router, React 19, Server Actions, Stripe Payment Element (@stripe/react-stripe-js), Vitest for unit tests, TypeScript discriminated unions.

**Spec:** `docs/superpowers/specs/2026-05-18-storefront-stripe-checkout-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/checkout/actions.ts` | Modify | `placeOrder` returnerer `PlaceOrderResult` discriminated union |
| `tests/unit/checkout-action.test.ts` | Create | Vitest enheds-test af `placeOrder` mock/stripe/error grene |
| `components/CheckoutForm.tsx` | Modify | To-trin state machine, mount `StripePaymentPanel` ved Stripe-mode |
| `app/checkout/page.tsx` | Modify | Server-side `isStripeReady()` → TEST-BUTIK-banner når false |

Ingen nye komponenter. `StripePaymentPanel` reuses uændret. `lib/orders/create.ts` reuses uændret.

---

## Task 1: `placeOrder` returnerer discriminated union

**Files:**
- Modify: `app/checkout/actions.ts`
- Create: `tests/unit/checkout-action.test.ts`

### - [ ] Step 1.1: Skriv failing test

Create `tests/unit/checkout-action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getCartSessionId: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cart", () => ({ getCartSessionId: mocks.getCartSessionId }));
vi.mock("@/lib/orders/create", () => ({ createOrder: mocks.createOrder }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { placeOrder } from "@/app/checkout/actions";

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const defaults = {
    shippingName: "Test Testesen",
    email: "test@example.com",
    shippingAddress: "Testvej 1",
    shippingZip: "1000",
    shippingCity: "København",
    discountCode: "",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.append(k, v);
  }
  return fd;
}

describe("placeOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.getCartSessionId.mockResolvedValue("sess_abc");
  });

  it("returnerer mock-mode når createOrder ikke leverer Stripe-felter", async () => {
    mocks.createOrder.mockResolvedValue({ ok: true, orderId: "ord_1" });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({ ok: true, mode: "mock", orderId: "ord_1" });
  });

  it("returnerer stripe-mode når createOrder leverer clientSecret", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: true,
      orderId: "ord_2",
      clientSecret: "pi_123_secret_xyz",
      publishableKey: "pk_test_abc",
      totalDkk: 999,
    });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({
      ok: true,
      mode: "stripe",
      orderId: "ord_2",
      clientSecret: "pi_123_secret_xyz",
      publishableKey: "pk_test_abc",
      totalDkk: 999,
    });
  });

  it("returnerer ok:false ved validation-fejl", async () => {
    const res = await placeOrder(makeFormData({ email: "ikke-en-email" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeTypeOf("string");
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("returnerer ok:false når createOrder fejler", async () => {
    mocks.createOrder.mockResolvedValue({ ok: false, error: "Lager tomt" });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({ ok: false, error: "Lager tomt" });
  });
});
```

### - [ ] Step 1.2: Kør testen — bekræft den fejler

Run: `npx vitest run tests/unit/checkout-action.test.ts`

Expected: alle 4 tests fejler — enten fordi `placeOrder` kaster (den kalder `redirect()` der ikke kan håndteres i test-context) eller returnerer wrong shape.

### - [ ] Step 1.3: Implementer den nye `placeOrder`

Replace entire content of `app/checkout/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getCartSessionId } from "@/lib/cart";
import { createOrder } from "@/lib/orders/create";
import { checkoutSchema } from "@/lib/validation";

export type PlaceOrderResult =
  | {
      ok: true;
      mode: "stripe";
      orderId: string;
      clientSecret: string;
      publishableKey: string;
      totalDkk: number;
    }
  | { ok: true; mode: "mock"; orderId: string }
  | { ok: false; error: string };

export async function placeOrder(
  formData: FormData,
): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse({
    shippingName: formData.get("shippingName"),
    email: formData.get("email"),
    shippingAddress: formData.get("shippingAddress"),
    shippingZip: formData.get("shippingZip"),
    shippingCity: formData.get("shippingCity"),
    discountCode: formData.get("discountCode"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ugyldige felter",
    };
  }

  const session = await auth();
  const cartSessionId = await getCartSessionId();
  const actor = session?.user?.id
    ? `user:${session.user.id}`
    : `cart:${cartSessionId}`;

  const result = await createOrder(parsed.data, { actor });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/kurv");
  revalidatePath("/konto/ordrer");

  // Stripe-felterne leveres af createOrder når isStripeReady()=true.
  // Frontend (CheckoutForm) switcher på mode for at vise enten payment-panel
  // eller redirect direkte til /ordre.
  if (
    "clientSecret" in result &&
    typeof result.clientSecret === "string" &&
    typeof result.publishableKey === "string" &&
    typeof result.totalDkk === "number"
  ) {
    return {
      ok: true,
      mode: "stripe",
      orderId: result.orderId,
      clientSecret: result.clientSecret,
      publishableKey: result.publishableKey,
      totalDkk: result.totalDkk,
    };
  }

  return { ok: true, mode: "mock", orderId: result.orderId };
}
```

Noter:
- `redirect()` er fjernet — frontend håndterer routing
- `next/navigation`-import fjernet (ikke længere brugt)
- Hvis `createOrder`s return type mangler `clientSecret`-felter, fallback til mock — defensiv

### - [ ] Step 1.4: Kør testen — bekræft alle passes

Run: `npx vitest run tests/unit/checkout-action.test.ts`

Expected: 4 passed.

Hvis "stripe-mode"-testen fejler fordi `createOrder` ikke matcher den forventede shape, læs `lib/orders/create.ts:62` for at se det faktiske return type og juster `in`-checket. (Spec siger create returnerer `clientSecret/publishableKey/totalDkk` ved stripe-ready, men verificer.)

### - [ ] Step 1.5: Type-check

Run: `npx tsc --noEmit`

Expected: ingen fejl.

### - [ ] Step 1.6: Commit

```bash
git add app/checkout/actions.ts tests/unit/checkout-action.test.ts
git commit -m "feat(p4): placeOrder returnerer discriminated union for stripe/mock"
```

---

## Task 2: `CheckoutForm` to-trin flow

**Files:**
- Modify: `components/CheckoutForm.tsx`

Ingen unit test (projektet bruger ikke React Testing Library). Verificeres manuelt via dev-browser i Task 4.

### - [ ] Step 2.1: Erstat `components/CheckoutForm.tsx`

Replace entire file content:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrder, type PlaceOrderResult } from "@/app/checkout/actions";
import { checkoutSchema } from "@/lib/validation";
import StripePaymentPanel from "@/components/StripePaymentPanel";

type FieldErrors = Partial<Record<string, string>>;
type FormValues = {
  shippingName: string;
  email: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
  discountCode: string;
};

type StripeData = Extract<PlaceOrderResult, { mode: "stripe" }>;

const EMPTY_VALUES: FormValues = {
  shippingName: "",
  email: "",
  shippingAddress: "",
  shippingZip: "",
  shippingCity: "",
  discountCode: "",
};

export default function CheckoutForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [step, setStep] = useState<"form" | "payment">("form");
  const [stripeData, setStripeData] = useState<StripeData | null>(null);

  function updateField<K extends keyof FormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const rawData = { ...values };

    const result = checkoutSchema.safeParse({
      ...rawData,
      discountCode: rawData.discountCode || undefined,
    });
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setServerError(null);
      return;
    }
    setFieldErrors({});
    setServerError(null);

    const formData = new FormData();
    for (const [k, v] of Object.entries(rawData)) {
      formData.append(k, v);
    }

    startTransition(async () => {
      const res = await placeOrder(formData);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      if (res.mode === "mock") {
        router.push("/ordre/" + res.orderId);
        return;
      }
      // res.mode === "stripe"
      setStripeData(res);
      setStep("payment");
    });
  }

  const inputClass =
    "w-full rounded-full border border-sol-ink/20 bg-white px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";
  const labelClass = "block text-sm font-bold text-sol-ink mb-1";

  if (step === "payment" && stripeData) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setStep("form");
            setStripeData(null);
          }}
          className="text-sm text-sol-muted hover:text-sol-ink underline"
        >
          ← Tilbage til leveringsoplysninger
        </button>

        <section className="rounded-2xl bg-sol-cream p-5 text-sm">
          <h3 className="font-black uppercase tracking-wide text-sol-ink mb-2">
            Leveres til
          </h3>
          <p className="text-sol-ink leading-relaxed">
            {values.shippingName}
            <br />
            {values.shippingAddress}
            <br />
            {values.shippingZip} {values.shippingCity}
            <br />
            <span className="text-sol-muted">{values.email}</span>
          </p>
        </section>

        <StripePaymentPanel
          clientSecret={stripeData.clientSecret}
          publishableKey={stripeData.publishableKey}
          totalDkk={stripeData.totalDkk}
          orderId={stripeData.orderId}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3 text-red-700 font-semibold text-sm">
          {serverError}
        </div>
      )}

      {[
        { name: "shippingName", label: "Fulde navn", type: "text", autoComplete: "name", placeholder: "Dit fulde navn" },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email", placeholder: "din@email.dk" },
        { name: "shippingAddress", label: "Leveringsadresse", type: "text", autoComplete: "street-address", placeholder: "Vejnavn nr." },
      ].map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className={labelClass}>
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            value={values[f.name as keyof FormValues]}
            onChange={(e) => updateField(f.name as keyof FormValues, e.target.value)}
            className={inputClass}
          />
          {fieldErrors[f.name] && (
            <p className="text-red-600 text-sm font-semibold mt-1">{fieldErrors[f.name]}</p>
          )}
        </div>
      ))}

      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div>
          <label htmlFor="shippingZip" className={labelClass}>Postnummer</label>
          <input
            id="shippingZip"
            name="shippingZip"
            type="text"
            autoComplete="postal-code"
            placeholder="2100"
            value={values.shippingZip}
            onChange={(e) => updateField("shippingZip", e.target.value)}
            className={inputClass}
          />
          {fieldErrors.shippingZip && (
            <p className="text-red-600 text-sm font-semibold mt-1">{fieldErrors.shippingZip}</p>
          )}
        </div>
        <div>
          <label htmlFor="shippingCity" className={labelClass}>By</label>
          <input
            id="shippingCity"
            name="shippingCity"
            type="text"
            autoComplete="address-level2"
            placeholder="København Ø"
            value={values.shippingCity}
            onChange={(e) => updateField("shippingCity", e.target.value)}
            className={inputClass}
          />
          {fieldErrors.shippingCity && (
            <p className="text-red-600 text-sm font-semibold mt-1">{fieldErrors.shippingCity}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="discountCode" className={labelClass}>
          Rabatkode <span className="text-sol-muted font-normal">(valgfri)</span>
        </label>
        <input
          id="discountCode"
          name="discountCode"
          type="text"
          placeholder="KØBTOO"
          value={values.discountCode}
          onChange={(e) => updateField("discountCode", e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black uppercase tracking-wide text-sol-cream transition hover:brightness-95 disabled:opacity-60"
      >
        {isPending ? "Behandler …" : "Til betaling"}
      </button>
    </form>
  );
}
```

Vigtige ændringer fra original:
- `values`-state for at bevare form ved Tilbage-navigation
- `step`-state med `"form" | "payment"`
- Knappens label ændret fra "Gennemfør køb" til "Til betaling"
- Ved `mode==="mock"`: samme redirect som før
- Ved `mode==="stripe"`: switch til payment-step med `StripePaymentPanel`
- Field-reads ændret fra DOM (`form.elements.namedItem`) til kontrollerede `values`-state (kræves for at bevare ved Tilbage)

### - [ ] Step 2.2: Type-check

Run: `npx tsc --noEmit`

Expected: ingen fejl. Hvis "TS2305: Module has no exported member 'PlaceOrderResult'" — bekræft at Task 1 commit eksisterer i samme working tree.

### - [ ] Step 2.3: Kør hele test-suite

Run: `npx vitest run tests/unit/`

Expected: alle tests passes — vi har ikke rørt orders/cart-logik.

### - [ ] Step 2.4: Commit

```bash
git add components/CheckoutForm.tsx
git commit -m "feat(p4): CheckoutForm to-trin med StripePaymentPanel ved Stripe-ready"
```

---

## Task 3: TEST-BUTIK-banner på checkout-side

**Files:**
- Modify: `app/checkout/page.tsx`

### - [ ] Step 3.1: Tilføj `isStripeReady`-check og banner

I `app/checkout/page.tsx`:

Add import (after existing imports):

```tsx
import { isStripeReady } from "@/lib/stripe";
```

Modify function signature og top of body:

Find:
```tsx
export default async function CheckoutPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
```

Replace with:
```tsx
export default async function CheckoutPage() {
  const [cart, stripeReady] = await Promise.all([
    getCart(),
    isStripeReady(),
  ]);
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
```

Find the return statement for non-empty cart (starts with `<div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">`):

Inside that root `<div>`, immediately after the opening tag and BEFORE `<h1 className="mb-10 text-4xl font-black …">Checkout</h1>`, insert:

```tsx
      {!stripeReady && (
        <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 px-5 py-3 text-amber-900 font-semibold text-sm">
          TEST-BUTIK — ingen rigtig betaling. Ordren registreres, men intet trækkes.
        </div>
      )}
```

(Banneret rendres kun når Stripe IKKE er konfigureret. Ved Stripe-ready vises intet banner, og to-trin flow tager over.)

### - [ ] Step 3.2: Type-check

Run: `npx tsc --noEmit`

Expected: ingen fejl.

### - [ ] Step 3.3: Commit

```bash
git add app/checkout/page.tsx
git commit -m "feat(p4): TEST-BUTIK-banner på checkout når Stripe ikke konfigureret"
```

---

## Task 4: End-to-end manuel verifikation

Denne task ændrer ingen kode — den verificerer at det implementerede flow virker i browseren.

### - [ ] Step 4.1: Start (eller genstart) dev server

Hvis dev kører på 3001: stop den (Ctrl+C i terminalen) og kør igen — modul-level cache i `lib/stripe.ts` skal cleares så ny Stripe-status detekteres.

```bash
cd ~/Documents/solbrillen.dk && PORT=3001 npm run dev
```

Expected: "Ready in <N>ms" inden 5 sekunder.

### - [ ] Step 4.2: Verificer Stripe-flow (keys SAT i admin)

Forudsætning: Stripe Secret + Publishable + Webhook secrets er sat i `/admin/integrations` (allerede gjort i denne session).

1. Åbn `http://localhost:3001/produkter` i en helt frisk browser (eller incognito) — ikke logget ind for at undgå stale-session-bug
2. Klik en produkt, klik "Læg i kurv"
3. Åbn `http://localhost:3001/checkout`
4. Forventet: INGEN TEST-BUTIK-banner. Form vises.
5. Fyld: navn, email, adresse, postnummer (fx 2100), by (fx København Ø)
6. Klik "Til betaling"
7. Forventet: siden switcher til payment-trin. "Leveres til"-sammendrag øverst. Stripe Payment Element rendret nedenunder med kort-felt, Apple Pay / MobilePay / Link-knapper hvor de er tilgængelige.
8. Klik "← Tilbage til leveringsoplysninger" — bekræft alle form-værdier bevares
9. Klik "Til betaling" igen
10. Indtast test-kort `4242 4242 4242 4242`, hvilken som helst fremtidig udløb, hvilken som helst CVC, hvilken som helst postnummer
11. Klik "Betal <total> kr"-knappen i panelet
12. Forventet: redirect til `/ordre/<id>` med "Tak for din ordre!"
13. Tjek https://dashboard.stripe.com/test/payments — der bør være en succeeded PaymentIntent
14. Kort efter (typisk <5s): tjek dev-log for `[stripe-webhook] event=payment_intent.succeeded` — bekræfter at webhook-event blev modtaget og processeret
15. Tjek `/admin/ordrer/<id>` — Order status skal være `paid`

### - [ ] Step 4.3: Verificer mock-flow (keys IKKE sat)

1. Åbn `/admin/integrations` → slet Stripe Secret/Publishable/Webhook secret-rows
2. Vent 30 sekunder (cache TTL) eller genstart dev server
3. Åbn `/checkout`
4. Forventet: GUL TEST-BUTIK-banner øverst på siden
5. Fyld form, klik "Til betaling"
6. Forventet: direct redirect til `/ordre/<id>` (ingen payment-trin) — samme som før refactoren
7. Sæt Stripe-keys tilbage bagefter (vi vil ikke have dev DB i broken state)

### - [ ] Step 4.4: Verificer declined-kort

1. Med Stripe-keys sat: gentag Step 4.2 trin 1-9
2. Indtast `4000 0000 0000 0002` (decline-test-kort)
3. Klik "Betal"
4. Forventet: fejlbesked inline i panelet ("Your card was declined" eller dansk-version). Ingen redirect. Bruger forbliver på checkout.
5. Skift til `4242 4242 4242 4242` og betal — succes-flowet bør virke i samme session uden refresh

### - [ ] Step 4.5: Commit verification-noter (valgfrit)

Hvis du har observeret afvigelser fra forventet adfærd undervejs, skriv dem ned i `docs/superpowers/specs/2026-05-18-storefront-stripe-checkout-design.md` under et nyt "Verification notes (post-impl)"-afsnit og commit:

```bash
git add docs/superpowers/specs/2026-05-18-storefront-stripe-checkout-design.md
git commit -m "docs(p4): post-impl verification notes for storefront Stripe"
```

Hvis intet at notere — skip denne step.

---

## Out-of-scope follow-ups (track separately, ikke i denne PR)

1. **`lib/stripe.ts:70` cache-invalidate**: admin-save bør kalde `invalidateStripeKeysCache()` så 30s-cache ikke stander mellem save → checkout-test. Tilføj kald i `app/api/admin/integrations/route.ts` (eller wherever Stripe-keys gemmes).
2. **`lib/cart.ts:getOrCreateCart` stale-userId**: efter DB-reseed kan en logged-in session pege på en User der ikke længere findes → FK violation ved `cart.create({ data: { userId } })`. Defensiv fix: verificer userId-existence før insert, fallback til guest path hvis ikke.
3. **Playwright e2e for hele checkout-flow**: dette plan dækker manuel verifikation. En automatiseret Stripe-test-mode e2e ville fange regressions ved fremtidige refactors.
