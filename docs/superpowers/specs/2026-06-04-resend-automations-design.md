# Marketing automations via Resend — design spec

**Date:** 2026-06-04
**Flag:** `marketingAutomations` (default-false)
**Status:** approved (verbal), implementing

## Goal

Let a Cartwright shop drive lifecycle email sequences (welcome, abandoned-cart
recovery, post-purchase) through **Resend Automations** — without Cartwright
owning the sequencing, scheduling, or drip content. Resend is already the email
transport (`lib/mailer/resend.ts`), so this is an additive, self-contained
extension: Cartwright **emits events**; Resend runs the automations the shop
owner wires in the Resend dashboard.

This is the chosen path over a broader ESP-agnostic event bus (Klaviyo/Mailerlite/
ActiveCampaign), which was rejected as premature surface area.

## Decisions (locked)

- **Events emitted:** all three — `cartwright.user.created`,
  `cartwright.cart.abandoned`, `cartwright.order.placed`.
- **Cartwright emits only.** It does not create automations or ship drip content;
  the owner builds sequences in Resend using the documented event names.
- **Consent-gated.** Marketing events fire only for customers with marketing
  consent. The single, adjustable policy: a **confirmed newsletter `Subscriber`**
  (`status === "confirmed"`). Cookie consent (`lib/consent-server.ts`) is
  per-browser, not email-addressable server-side, so it can't gate a cron — the
  newsletter opt-in is the email-tied signal.

## Architecture — thin emitter + direct calls

One seam, called at three existing lifecycle points. Not an internal event bus
(that's the rejected broad-ESP path); not scattered inline `events.send()`
(untestable).

### Core module: `lib/marketing/automations.ts`

```ts
export const MARKETING_EVENTS = {
  userCreated:   "cartwright.user.created",
  cartAbandoned: "cartwright.cart.abandoned",
  orderPlaced:   "cartwright.order.placed",
} as const;

// Returns true iff an event was actually sent to Resend.
export async function emitMarketingEvent(
  eventName: string,
  email: string,
  payload?: Record<string, unknown>,
): Promise<boolean>;

// Single consent policy. Easy to broaden later (e.g. order marketingConsent).
export async function hasMarketingConsent(email: string): Promise<boolean>;
```

`emitMarketingEvent` no-ops (returns false) when **any** gate fails, in order:
1. `marketingAutomations` flag off (`brand.features`).
2. No Resend key (`getResendApiKey()` null).
3. `!hasMarketingConsent(email)`.

Otherwise it calls `new Resend(key).events.send({ eventName, email, data: payload })`,
wrapped in try/catch with `console.error` — **fire-and-forget, never throws into
the caller** (mirrors the existing `getMailer()` Resend→preview fallback). All
callers `void`-call it so it never blocks or fails the request.

`hasMarketingConsent(email)` = `prisma.subscriber.findUnique({ where: { email } })`
with `status === "confirmed"`.

### Emit points (3)

| Event | Location | When |
|---|---|---|
| `user.created` | `app/[locale]/account/actions.ts` | after `prisma.user.create` (registration) |
| `order.placed` | `app/api/webhook/stripe/route.ts` | after the order is marked `status:"paid"` (once per order; the already-paid early-return upstream guarantees single fire) |
| `cart.abandoned` | `lib/abandoned-cart.ts` `runAbandonedCartJob` | per eligible cart, in the cron |

### Abandoned-cart: emit vs direct-send (no double email)

`runAbandonedCartJob` gains a mode decision per the flags:
- `marketingAutomations` on → **emit** `cart.abandoned` (Resend runs the drip),
  **skip** the direct `sendAbandonedCartEmail`. Still write `AbandonedCartLog`
  (idempotency marker: `"resend-automation"` if emitted, `"skipped-no-consent"`
  if the consent gate blocked it) so the cart isn't re-evaluated every run.
- `marketingAutomations` off, `abandonedCart` on → today's direct-send path,
  unchanged.

The cron route gate (`app/api/cron/abandoned-cart/route.ts`) changes from
`if (!abandonedCart)` to `if (!(abandonedCart || marketingAutomations))` so the
detection loop runs when either flag is on. Automations takes precedence when
both are on.

## Feature flag

`marketingAutomations: false` in `brand.config.ts` (`brand.features`) + a
`DESCRIPTORS.marketingAutomations` entry in `lib/feature-flags/manifest.ts`
(compile-enforced `Record<FeatureKey, …>`): group `"Storefront UX"`, `tier:
"runtime"`, `precondition: { kind: "ecommerce" }`, `implemented: true`. Shows up
in `/admin/features` automatically. Runtime-inert without a Resend key.

## Config & docs

- `docs/marketing-automations.md` — the three event names, their payload shapes,
  the consent policy, and how to wire the matching automations in the Resend
  dashboard (where the trigger `eventName` must match).
- No new admin UI required (the flag is in `/admin/features`; the Resend key
  already lives in `/admin/integrations`). Event names are documented, not
  configurable — they're the integration contract.

## Error handling

Every emit is best-effort: try/catch + log, never throw. A Resend outage or a
missing automation in the dashboard never affects checkout, signup, or the cron's
other carts. The abandoned-cart loop already isolates per-cart failures.

## Testing (`tests/unit/marketing-automations.test.ts` + `tests/unit/abandoned-cart.test.ts`)

Mock `getResendApiKey` + the Resend client + `prisma.subscriber`:
- flag off → no-op, returns false, Resend not called.
- no Resend key → no-op, returns false.
- no consent (no confirmed subscriber) → no-op, returns false.
- happy path → `events.send` called once with `{ eventName, email, data }`,
  returns true.
- Resend throws → returns false, does not rethrow.
- `hasMarketingConsent` → true only for `status === "confirmed"`.
- abandoned-cart branch: `marketingAutomations` on → emits + writes log +
  skips `sendAbandonedCartEmail`; off + `abandonedCart` on → direct-send path.

## Verification caveat

Live Resend Automations delivery (actual drips) can't be verified without a Resend
account + configured automations — same "needs live creds" caveat as Prisma 7's
Turso step. Local gates: `tsc`, `lint`, `build`, `pnpm test` (incl. the no-op
paths above).

## Out of scope (YAGNI)

- ESP-agnostic event bus + Klaviyo/Mailerlite/ActiveCampaign adapters.
- Cartwright-authored drip content / automation creation via API.
- Per-event consent policies (one helper now; broaden if needed).
