# Invoicing & VAT

Integration-first, **ingen egen moms-/faktura-motor**. Du ejer kun en tynd adapter.

## VAT (moms)

- **Indbygget single-rate**: `lib/tax.ts` `vatBreakdown(amountOere)` — bruger
  `brand.policies.vatRatePct` (DK 25) + `pricesIncludeVat` (dansk B2C = true).
  Dækker single-country shops uden ekstern afhængighed.
- **Managed multi-country**: sæt `brand.features.stripeTax = true` → fakturaer
  oprettes med Stripe Tax (`automatic_tax`), som håndterer EU-OSS + VAT-ID-
  validering. Aktivér også Stripe Tax i Stripe-dashboardet.

## Faktura — `InvoiceProvider`-interface

Cartwright-koden kender kun `lib/invoicing/types.ts:InvoiceProvider`. Tre adaptere:

| Provider | Status | Til |
|---|---|---|
| `stripe` | **virker** (default) | Stripe Invoicing — hosted + PDF, i jeres stack |
| `economic` | stub | dansk bogføring, EAN/NemHandel, revisor-sync ([REST](https://restdocs.e-conomic.com/)) |
| `dinero` | stub | dansk bogføring via Visma Connect ([API](https://developer.dinero.dk/)) |

Skift provider uden at røre kalde-koden:
```ts
import { createInvoiceForOrder } from "@/lib/invoicing";
const result = await createInvoiceForOrder(order);          // default (stripe)
const result = await createInvoiceForOrder(order, "economic"); // når implementeret
```

## Wiring (integrationstrinet — gøres mod det rigtige checkout-flow)

Bevidst IKKE wiret ind i live-checkout i denne branch (kræver det rigtige
betalings-flow at teste sikkert). For at aktivere:

1. **Moms ved ordre-oprettelse** (`lib/orders/create.ts`): efter totalen er
   beregnet, sæt `vatOere = vatBreakdown(totalDkk).vat`.
2. **Faktura ved betaling** (Stripe-webhook `app/api/webhook/stripe`): når en ordre
   bliver `paid`, kald `createInvoiceForOrder(order)` og gem
   `Order.invoiceId/invoicePdfUrl/invoiceProvider`. Idempotent (tjek at invoiceId
   ikke allerede er sat — samme mønster som `confirmationEmailSentAt`).
3. **Visning**: vis momslinjen i kurv/checkout/ordrebekræftelse, og link til
   `invoicePdfUrl` i admin + på kundens konto-ordreside.

## Implementering af e-conomic/Dinero

Erstat `throw` i `economic.ts`/`dinero.ts` med REST-kaldene + læs credentials fra
`IntegrationSettings` (krypteret, samme mønster som Stripe-key). Interface-
kontrakten er den samme, så resten af koden er uændret.
