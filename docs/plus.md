# Cartwright Plus

Cartwright Plus is a **paid membership**, not a software license. The engine is and stays
MIT — everything you have already downloaded keeps working forever, whether or not you are
a member. Plus adds the services around the code:

- **Priority email support** — first response within one business day (weekdays), up to two
  active tickets per month, for one production repository.
- **Release & security upgrade guidance** — tailored to the engine version recorded in your
  project's `.cartwright/release.json`, including security advisories.
- **Cartwright Pro agent playbooks** — the four industry playbooks plus a production-health
  checklist, delivered via your activation email.
- **SEO/GEO Lab — beta access** — early access to the SEO/GEO experimentation lab
  (beta; not the full Autopilot).

Cancel anytime. Your site and all already-downloaded code keep running.

## The access key

When you purchase Plus on [cartwright.app/pricing](https://cartwright.app/pricing), you
receive a **Plus access key** on the success page and by email:

```
cw_plus_v1.<payload>.<signature>
```

The payload (plan, Stripe customer/subscription ids, issue date, key id) is signed with
cartwright.app's Ed25519 private key. Your shop verifies it **offline** with the public key
that ships in the engine — no phone-home is needed to prove the key is genuine. Online
verification against `cartwright.app/api/v1/license/verify` additionally confirms the
subscription is still active.

## Activation

1. Purchase Plus — copy the access key from the success page or activation email.
2. Set it as the `CARTWRIGHT_PLUS_KEY` environment variable in your deployment

> **Required in v1:** also set `CARTWRIGHT_PLUS_PUBLIC_KEY` (provided together with your
> access key in the purchase email). Engine builds do not yet embed the production
> verification key, so without this variable every key reports `invalid`/`no-public-key`.
> A future engine release bakes the public key in and removes this step.
   (Vercel project settings, or `.env.local` for local dev), then redeploy/restart.
3. Open **`/admin/plus`** in your shop's admin. The page shows verification status;
   when the key verifies as active, click **Enable Plus features**. That flips the
   `cartwrightPlus` runtime feature flag through the same audited override path as
   `/admin/features`, unlocking the Pro surfaces in your admin (e.g. the SEO/GEO Lab).

v1 note: the key is env-only — there is no paste-the-key form yet (that flow, plus cached
verification with an offline grace window, is a planned follow-up). Status is checked when
you load `/admin/plus`, nowhere else.

## Trust-based enforcement, by design

**A canceled key never shuts down your site.** Verification failures — a lapsed
subscription, a network outage, an invalid key — only affect the Plus *membership*
services: support, upgrade guidance, and private downloads. They never disable your
storefront, checkout, admin, or any code already in your repository. Concretely:

- If cartwright.app is unreachable, the status shows **Offline (key valid)** and nothing
  is turned off.
- If your subscription lapses, the status shows **Inactive** — your site keeps running,
  and the `cartwrightPlus` flag is **never auto-disabled**. Turning it off is always a
  manual choice in `/admin/features`.
- The engine is MIT. Removing the key, or never setting one, is a perfectly valid way to
  run Cartwright.

This is intentional. The key proves membership; it is not DRM.

## Lost or leaked keys

Email support and the key will be reissued (the old one revoked server-side). Keys are
proof of membership, not copy protection — there is no self-service recovery form yet;
reissue is manual while volume is low.

## For operators / CI

- `CARTWRIGHT_PLUS_KEY` — the access key (env-only in v1; safe to set per-environment).
- `CARTWRIGHT_PLUS_PUBLIC_KEY` — optional override of the built-in verification public key
  (base64 SPKI DER or PEM). Only needed for testing or key rotation before an engine update.
- `NEXT_PUBLIC_STRIPE_PORTAL_URL` — optional billing-portal link shown on `/admin/plus`;
  without it, members manage billing via the portal link in their purchase email.

Implementation: `lib/cartwright-plus.ts` (offline Ed25519 verification, fail-soft online
check, status resolution) and `app/admin/plus/` (admin page + audited flag activation).
Tests: `tests/unit/plus-key.test.ts`.
