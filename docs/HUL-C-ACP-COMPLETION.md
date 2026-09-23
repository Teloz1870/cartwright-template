# Hul C — ACP checkout completion (delegated payment): færdiggørelse

**Status: WIRED (kode-klar men inert).** ACP-session-lifecyclen
(create/update/retrieve/cancel) OG `/complete` (betaling) er nu implementeret.
Blokken er fortsat gated bag env-flaget `ACP_PAYMENT_COMPLETION=1` og er **inert
som default** — uden flaget svarer `POST /api/acp/v1/checkout_sessions/[id]/complete`
præcis som før (501 "not enabled"). Stien afventer kun de to eksterne
forudsætninger nedenfor før den kan gå live; selve koden er færdig og unit-testet
mod en mocket Stripe-klient (`tests/unit/acp-complete.test.ts`, 10 cases).

## Hvad der mangler før go-live (eksternt — ikke kode)

To eksterne afhængigheder, der ikke kan skaffes i koden:

1. **Stripe Shared Payment Token (SPT) adgang** — delegated payment kræver at
   Stripe-kontoen har agentic-commerce/SPT aktiveret.
2. **ChatGPT merchant-onboarding** — for at agenter rent faktisk kan delegere
   betaling til shoppen (`chatgpt.com/merchants`).

## Hvad koden gør nu (færdig + testet)

- `lib/acp/complete.ts` — `completeAcpSession(sessionId, input)`:
  - validerer env-gate, henter session (`retrieveSession`), validerer status
    `ready_for_payment` + buyer-email (+ tydelige `AcpError`-koder).
  - idempotency-replay via `AcpIdempotencyKey` (samme `idempotency_key` →
    tidligere svar, ingen dobbelt-charge).
  - `chargeViaSharedPaymentToken()` opretter en off-session Stripe PaymentIntent
    med SPT'en som `payment_method` (`getStripeClient()`); fejler `acp_payment_failed`
    hvis ikke `succeeded`.
  - opretter ordren via `createOrderFromAcpSession()` og best-effort-refunderer
    hvis ordre-oprettelse fejler EFTER charge.
- `lib/orders/create-acp.ts` — `createOrderFromAcpSession()`: bygger ordren fra
  `lineItemsJson` + buyer/shipping (IKKE cart), atomisk anti-oversell-decrement,
  discount-usage, markerer sessionen completed atomisk (`ready_for_payment` →
  `completed` conditional claim), sender bekræftelses-mail.
- `app/api/acp/v1/checkout_sessions/[id]/complete/route.ts` — gate + body-parse
  (`shared_payment_token` + `idempotency_key`) + fejl-mapping.
- `tests/unit/acp-complete.test.ts` — 10 cases: env-gate, validering, email-krav,
  provider-unavailable, payment_failed, SPT-charge-args, refund-on-failure,
  idempotency-replay + -persist, succes-flow.

## Færdiggørelses-checkliste (resterende)

### 1–3 (SPT-charge, ordre-fra-session, markér completed) ✅ FÆRDIG
Implementeret i `lib/acp/complete.ts` + `lib/orders/create-acp.ts` (se ovenfor).

### 4. Token-lifecycle-webhooks (valgfri hærdning)
Håndtér SPT/PaymentIntent-lifecycle i `app/api/webhook/stripe/route.ts`
(allerede idempotent via `ProcessedWebhookEvent`): `payment_intent.succeeded`
findes. ACP-ordren oprettes synkront i `/complete` (off-session confirm), så
webhook'en er ikke load-bearing for happy-path; tilføj kun håndtering hvis Stripe
sender SPT-specifikke events vi vil reagere på.

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
