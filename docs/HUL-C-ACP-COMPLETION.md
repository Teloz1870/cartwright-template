# Hul C — ACP checkout completion (delegated payment): færdiggørelse

**Status: SCAFFOLD.** ACP-session-lifecyclen (create/update/retrieve/cancel) er
komplet; kun `/complete` (betaling) mangler. Denne blok er gated bag env-flaget
`ACP_PAYMENT_COMPLETION=1` og er **inert som default** — uden flaget svarer
`POST /api/acp/v1/checkout_sessions/[id]/complete` præcis som før (501 "not
enabled"). Scaffold'en kan ikke afsluttes uden de eksterne forudsætninger
nedenfor.

## Hvorfor den ikke er færdig

To eksterne afhængigheder, der ikke kan skaffes i koden:

1. **Stripe Shared Payment Token (SPT) adgang** — delegated payment kræver at
   Stripe-kontoen har agentic-commerce/SPT aktiveret.
2. **ChatGPT merchant-onboarding** — for at agenter rent faktisk kan delegere
   betaling til shoppen (`chatgpt.com/merchants`).

## Hvad scaffold'en allerede gør (ægte + testet)

- `lib/acp/complete.ts` — `completeAcpSession(sessionId, input)`:
  - validerer env-gate, henter session (`retrieveSession`), validerer status
    `ready_for_payment` (+ tydelige `AcpError`-koder).
  - når frem til det isolerede `chargeViaSharedPaymentToken()`-trin, der kaster
    `payment_not_wired` (501) indtil SPT wires.
- `app/api/acp/v1/checkout_sessions/[id]/complete/route.ts` — gate + body-parse
  (`shared_payment_token` + `idempotency_key`) + fejl-mapping.
- `tests/unit/acp-complete.test.ts` — dækker env-gate + status-validering.

## Færdiggørelses-checkliste

### 1. Wire SPT-opkrævningen (`chargeViaSharedPaymentToken` i `lib/acp/complete.ts`)
Opret en Stripe PaymentIntent med SPT'en som `payment_method` + `confirm: true`
(off-session, agent-delegeret):
```ts
const intent = await stripe.paymentIntents.create({
  amount: amountMinor,            // session.totalDkk (minor units)
  currency,                       // session.currency
  payment_method: sharedPaymentToken,
  confirm: true,
  off_session: true,
  metadata: { acpSessionId, source: "agentic_commerce" },
}, { idempotencyKey: idempotencyKey ?? `acp_${acpSessionId}` });
```
Bemærk: dette afviger fra `lib/stripe.ts:createPaymentIntent` (som bruger
`automatic_payment_methods`) — SPT-flowet er off-session + delegeret.

### 2. Opret ordren fra session-line-items (IKKE cart)
`createOrder()` i `lib/orders/create.ts` læser **cart** (session-cookie), så den
kan ikke genbruges direkte. Byg ordren fra `session.lineItemsJson` +
buyer/shipping-felterne på `AcpCheckoutSession`. Genbrug stock-check +
pris-/moms-logikken derfra, men med session-data som kilde. Sæt
`Order.channel = "acp"`, `Order.acpSessionId`, `Order.status = "paid"` (SPT er
allerede confirmed).

### 3. Markér sessionen completed
Sæt `AcpCheckoutSession.status = "completed"` + `orderId`. Returnér den
serialiserede session (`serializeAcpSession`).

### 4. Token-lifecycle-webhooks
Håndtér SPT/PaymentIntent-lifecycle i `app/api/webhook/stripe/route.ts`
(allerede idempotent via `ProcessedWebhookEvent`): `payment_intent.succeeded`
findes; tilføj evt. håndtering af SPT-specifikke events hvis Stripe sender dem.

### 5. (Relateret, roadmap Hul C-b) Wire `@ai-sdk/openai`
`@ai-sdk/openai` ligger ubrugt i `package.json`. For ChatGPT-Instant-Checkout-
siden: tilføj en `openai`-provider-gren i `lib/ai/client.ts` (parallelt med
`resolveAnthropic`/`resolveLocal`), GPT-entries i `MODEL_CAPABILITIES`, og et
`openaiApiKey`-felt i `IntegrationSettings` (Prisma-migration + admin-UI). Holdt
ude af denne scaffold da det kræver schema-migration + ikke kan testes uden
OpenAI-key.

### 6. Promovér env-gate → feature-flag
Når flowet virker end-to-end: erstat `ACP_PAYMENT_COMPLETION`-env-gaten med en
rigtig `acpPaymentCompletion`-feature-flag i `lib/feature-flags/manifest.ts`
(`dependsOn: ["acp"]`, default-off) + `brand.features`, så den kan toggles i
`/admin/features`.

## Test før go-live
Kør et ægte agent-delegeret køb gennem en ACP-klient mod
spec-version `2026-04-17`; verificér ordre + betaling + session-completion.
