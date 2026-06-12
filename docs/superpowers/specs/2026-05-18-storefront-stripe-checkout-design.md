# Storefront Stripe Checkout — Design

**Status:** approved — ready for implementation plan
**Date:** 2026-05-18
**Author:** brainstormed with Claude Opus 4.7

## Problem

Storefront `/checkout` accepterer aldrig rigtig betaling. `placeOrder` server action
ignorerer den `clientSecret`/`publishableKey` som `createOrder()` returnerer når
Stripe er konfigureret, og redirector direkte til `/ordre/<id>`. Ordrer går derfor
igennem som mock uanset om Stripe-keys er sat. `StripePaymentPanel` eksisterer som
komponent men er kun monteret i `components/AIStylistPanel.tsx` (chat-assistenten).

Brugeren ser ingen kort/Apple Pay/MobilePay-felter ved checkout fra storefront.

## Goal

Bind den eksisterende Stripe-Payment-Element-implementation ind i storefront-
checkout som en to-trins flow. Behold mock-fallback når Stripe ikke er
konfigureret (eller `getStripeKeys()` cache returnerer null).

## Architecture

### Two-step flow

```
Trin 1: CheckoutForm submits form
  └─ placeOrder() action
       ├─ Stripe ready  → createOrder() returnerer
       │                  { ok, mode:"stripe", orderId, clientSecret, publishableKey, totalDkk }
       └─ Mock          → createOrder() returnerer
                          { ok, mode:"mock", orderId }
                          → client: router.push("/ordre/" + orderId)

Trin 2 (kun mode="stripe"): client switcher til payment-state
  ├─ Leveringsoplysninger vises som låst sammendrag (read-only)
  ├─ "Tilbage"-link gør switch til trin 1 (form-værdier bevaret via useState)
  └─ <StripePaymentPanel clientSecret={…} publishableKey={…} totalDkk={…} orderId={…} />
     ├─ Apple Pay / MobilePay / Link / kort via PaymentElement automatic_payment_methods
     ├─ Ved success: StripePaymentPanel redirecter selv til /ordre/<id>
     └─ Webhook (whsec allerede konfigureret) modtager payment_intent.succeeded
        → opdaterer Order.status til "paid" via eksisterende handler
```

### Server-side state during payment

- Order oprettes i trin 1 (af `createOrder`) med `status="pending_payment"`
- PaymentIntent oprettes samtidigt og linkes til Order
- Trin 2 confirmer kun PaymentIntent — opretter intet nyt server-side
- Webhook flytter Order til `paid` ved `payment_intent.succeeded`
- `/api/cron/reconcile-stripe` (eksisterende) håndterer pending-orders ved abandoned payments

## Files Changed

### `app/checkout/actions.ts` — modify

Fjern `redirect(`/ordre/${result.orderId}`)`. Returner discriminated union så
client kan beslutte næste skridt.

```ts
type PlaceOrderResult =
  | { ok: true; mode: "stripe"; orderId: string;
      clientSecret: string; publishableKey: string; totalDkk: number }
  | { ok: true; mode: "mock"; orderId: string }
  | { ok: false; error: string };

export async function placeOrder(formData: FormData): Promise<PlaceOrderResult> { … }
```

`createOrder()` returnerer allerede de relevante felter — denne action mapper
dem til en explicit discriminated union så CheckoutForm kan switche eksplicit
på `mode`.

### `components/CheckoutForm.tsx` — modify

Tilføj `step`-state (`"form" | "payment"`) og `paymentData`-state med Stripe-
felterne. handleSubmit kalder `placeOrder`. Switch på resultat:

- `mode==="mock"` → `router.push("/ordre/" + orderId)` (eksisterende adfærd)
- `mode==="stripe"` → `setPaymentData({…})`; `setStep("payment")`
- `ok===false` → vis fejl over form (eksisterende adfærd)

Trin 2-render: leveringssammendrag (read-only) + "← Tilbage"-link + 
`<StripePaymentPanel {...paymentData}/>`. Form-state bevares så Tilbage-knappen
ikke kræver re-fyld.

### `app/checkout/page.tsx` — modify

Tilføj server-side `await isStripeReady()`-check. Hvis false: render TEST-BUTIK-
banner øverst:

```tsx
{!stripeReady && (
  <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 px-5 py-3 text-amber-900 font-semibold text-sm">
    TEST-BUTIK — ingen rigtig betaling. Ordre oprettes, men intet trækkes.
  </div>
)}
```

### Files NOT touched

| Fil | Hvorfor ikke |
|---|---|
| `lib/orders/create.ts` | Returnerer allerede clientSecret/publishableKey/totalDkk korrekt |
| `components/StripePaymentPanel.tsx` | Reuses uændret — props matcher allerede |
| `app/ordre/[id]/page.tsx` | Bekræftelse fungerer ens for mock og Stripe |
| `app/api/webhook/stripe/route.ts` | Håndterer allerede `payment_intent.succeeded` |
| `app/api/cron/reconcile-stripe` (hvis findes) | Håndterer allerede abandoned payments |
| `lib/stripe.ts` | Ingen cache-invalidate-fix i denne PR (separat issue) |

## Error Handling

| Fejl | Hvor | Adfærd |
|---|---|---|
| Form validation | Trin 1, client | Field errors inline under hver input (eksisterende) |
| `createOrder` fejler (Stripe API nede) | Server action returnerer `{ ok:false }` | Trin 1, fejl-banner over form, bruger prøver igen |
| Stripe `confirmPayment` fejler (kort declined) | Trin 2, inde i `StripePaymentPanel` | Panel viser Stripe-fejlbesked inline, bruger prøver igen — Order forbliver pending |
| Webhook leverer ikke `payment_intent.succeeded` | Background | Reconcile-cron opdaterer Order |
| User lukker browser i trin 2 | n/a | Order forbliver pending → reconcile-cron rydder op |
| `pk_test_...` der ikke matcher `sk_test_...` | Trin 2 ved confirm | Stripe SDK fejler → panel viser fejl |

## UX details

- Trin 2 har "← Tilbage til leveringsoplysninger" link (ikke knap — discrete).
  Tilbage genmontererer trin 1 med values intact (useState bevares).
- "Total"-summary er synlig i begge trin (allerede der i page.tsx aside).
- Loading-state mellem trin 1-submit og trin 2-mount: brug existing `isPending`
  fra `useTransition` til at vise spinner på "Til betaling"-knappen.
- Trin 2-CTA: panel renders allerede sin egen "Betal 999 kr"-knap.

## Testing

Manuel dev-test (intet automatisk test-suite-tilføj):

1. Med Stripe-keys i admin-panel:
   - Hit `/checkout`, fyld form, klik "Til betaling" → forventer trin 2 med Stripe Payment Element
   - Test-kort `4242 4242 4242 4242`, evt. CVC + udløb → forventer redirect til `/ordre/<id>`
   - Tjek Stripe Dashboard test-mode → PaymentIntent skal vises som succeeded
   - Tjek admin `/admin/ordrer/<id>` → Order skal være `paid` (via webhook)
   - Decline-kort `4000 0000 0000 0002` → forventer fejl inline, ingen redirect
2. Uden Stripe-keys (slet rows i admin → wait 30s for cache):
   - Hit `/checkout` → forventer TEST-BUTIK-banner
   - Submit form → forventer direct redirect til `/ordre/<id>` (mock-flow uændret)

## Non-goals (eksplicit ude af scope)

- Stripe Checkout (hosted page) som alternativ
- `lib/stripe.ts` cache-invalidation fix (admin-save burde kalde `invalidateStripeKeysCache`)
- Refactor af `AIStylistPanel.tsx` Stripe-integration til at dele kode med storefront
- Live-mode (sk_live_…) — separat opgave når TEST-mode er verificeret
- Persisting trin 2-state hvis user reloader siden (acceptabelt at de starter forfra)

## Out-of-scope follow-ups (worth tracking)

- `lib/stripe.ts:70` `invalidateStripeKeysCache()` defineret men ALDRIG kaldt fra admin-save — gem keys → vent 30s. Bør kaldes i admin Stripe-save handler.
- Storefront cart "stale userId after DB reseed" — defensiv fix i `lib/cart.ts:getOrCreateCart` (verificer userId før FK-insert)
