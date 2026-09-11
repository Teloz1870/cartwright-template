# Marketing automations (Resend)

The `marketingAutomations` feature lets your shop drive **lifecycle email
sequences** — welcome, abandoned-cart recovery, post-purchase — through
**[Resend Automations](https://resend.com/features/automations)**.

Cartwright's job is small and self-contained: it **emits events** at the right
moments. Resend runs the actual sequences (timing, steps, content) that you wire
in the Resend dashboard. Cartwright never owns the drip content or scheduling.

Source: [`lib/marketing/automations.ts`](../lib/marketing/automations.ts).

---

## Turning it on

1. Set a **Resend API key** (`/admin/integrations`, or `RESEND_API_KEY`). Resend
   is already Cartwright's email transport — the same key is used.
2. Enable **`marketingAutomations`** in `/admin/features` (or
   `brand.features.marketingAutomations = true`). Default off.
3. In the Resend dashboard, create one Automation per sequence you want, each
   with a **trigger** whose event name matches the ones below.

Without a Resend key the feature is inert (every emit is a no-op).

## The events Cartwright emits

| Event name | Fired when | Payload |
|---|---|---|
| `cartwright.user.created` | a customer registers (`app/[locale]/account/actions.ts`) | `{ name }` |
| `cartwright.cart.abandoned` | the abandoned-cart cron finds a logged-in cart inactive ≥ 24h | `{ cartUrl, itemCount, items: [{ productName, quantity, unitPriceDkk }] }` |
| `cartwright.order.placed` | an order is marked paid (Stripe webhook) | `{ orderId, totalDkk, currency, itemCount }` |

Wire each to an automation in Resend using the matching trigger `eventName`.
Resend **auto-creates the contact** from the event's email if it doesn't exist,
then runs the sequence. Use the payload fields in your templates.

## Consent

Marketing events fire **only for customers who have given marketing consent** —
defined as a **confirmed newsletter subscriber** (`Subscriber.status ===
"confirmed"`). This includes `order.placed`, so post-purchase sequences are also
consent-gated by default.

The whole policy lives in one function — `hasMarketingConsent(email)` in
[`lib/marketing/automations.ts`](../lib/marketing/automations.ts). To broaden it
(e.g. honor a checkout marketing-consent checkbox, or treat post-purchase as
transactional), change that one function.

Cookie consent (`lib/consent-server.ts`) is per-browser and can't address an
email server-side, so it is **not** the gate — the newsletter opt-in is.

## Relationship to the abandoned-cart cron

The existing `abandonedCart` flag sends a single recovery email directly. With
`marketingAutomations` on, the **same cron** instead **emits
`cartwright.cart.abandoned`** so Resend runs a multi-step drip, and the direct
single-send is skipped (no double email). The cron runs when **either** flag is
on:

| `abandonedCart` | `marketingAutomations` | Behavior |
|---|---|---|
| on | off | Direct single recovery email (unchanged) |
| off | on | Emit `cart.abandoned` → Resend drip |
| on | on | Emit `cart.abandoned` → Resend drip (automations wins; no direct send) |
| off | off | Cron no-ops |

Either way the cart gets an `AbandonedCartLog` row so it is never processed
twice.

## What Cartwright does **not** do

- It does not create automations or ship drip content — you build sequences in
  Resend.
- It is not ESP-agnostic — this integration is Resend-specific by design (Resend
  is already the transport). A broader ESP/event-bus layer was intentionally not
  built.

## Verifying

Live drip delivery requires a Resend account with the automations configured —
verify there. Locally, the gates (flag off / no key / no consent → no-op) and the
emit call shape are covered by
[`tests/unit/marketing-automations.test.ts`](../tests/unit/marketing-automations.test.ts)
and the abandoned-cart branch in
[`tests/unit/abandoned-cart.test.ts`](../tests/unit/abandoned-cart.test.ts).
