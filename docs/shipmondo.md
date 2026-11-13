# Shipmondo

Cartwright ships with a [Shipmondo](https://shipmondo.com) integration: one connection reaches
PostNord, GLS, DAO, Bring, Danske Fragtmænd and 50+ other carriers. It works the way Shipmondo's
WooCommerce plugin does:

1. A paid order goes to Shipmondo as a **sales order**.
2. The shop books the label **in Shipmondo**, as it does today (rules, printing, pick lists).
3. When the shipment is created, its **tracking comes back** to the order: the order moves to
   *shipped* and the customer gets the shipping email with the tracking number.

The integration is the `shipmondo` plugin (`plugins/shipmondo/`), behind the `shipmondo` feature
flag. It is **off by default** and adds nothing to a shop until it is turned on and an account is
connected.

> **Status.** Built and covered by tests against Shipmondo's published OpenAPI specification and
> webhook documentation. It has **not yet been run against a live Shipmondo account**, so the flag
> is marked *not implemented* in `/admin/features` until that test has passed. A parcel-shop picker
> in checkout is not part of it yet.

## Setting it up

1. **API credentials.** In Shipmondo, open *Settings → Integrations → API* and create an API user.
   Set them in the environment (never in a tracked file):

   ```bash
   SHIPMONDO_API_USER="…"
   SHIPMONDO_API_KEY="…"
   # SHIPMONDO_SANDBOX="1"   # talk to sandbox.shipmondo.com instead of production
   ```

2. **Webhook key.** Pick a long random string. Shipmondo signs every webhook with it (HS256):

   ```bash
   SHIPMONDO_WEBHOOK_KEY="$(openssl rand -hex 32)"
   ```

3. **Wait for the switch.** The `shipmondo` flag is not implemented yet. Until a test against a live
   Shipmondo account has passed, `/admin/features` lists it as *not implemented* and offers no switch,
   so the integration stays off. Once the switch is there, turn it on (a webshop is required); steps 4
   and 5 apply from then.

4. **Register the webhook.** Open `/admin/shipmondo` and click *Register webhook*. It registers
   "Shipments: create" at `https://<your site>/api/shipmondo/webhook`. Shipmondo has to reach that
   URL, so register it from the live site (`brand.url` must be public https). The page shows
   whether the account is connected, whether the webhook is registered and active, and the paid
   orders of the last 14 days with their state in Shipmondo, unsent ones first.

5. **Schedule the sweep.** Call `GET /api/cron/shipmondo-orders` every few minutes, with
   `Authorization: Bearer $CRON_SECRET`. It is not in `vercel.json`, because Vercel's Hobby plan
   only runs crons once a day. Use a Vercel Pro cron or any external scheduler.

## How an order reaches Shipmondo

- **At payment.** When an order is paid, it is sent right after the response. A slow or
  unreachable Shipmondo can neither delay nor fail the payment.
- **From `/admin/shipmondo`.** Send one order, or all unsent ones.
- **By the sweep.** Any paid order from the last 14 days that has not reached Shipmondo is sent:
  one Shipmondo refused, or one paid while it was down. Orders marked paid by hand (a bank
  transfer) are included.

**Sending by hand.** A shop that sends some orders another way (a supplier ships them, the customer
collects them) can keep every order out of Shipmondo until someone chooses to send it: set
`SHIPMONDO_SEND_MODE="manual"`. Then neither payment nor the sweep sends anything, and orders go to
Shipmondo only from `/admin/shipmondo`. Tracking still comes back for the orders that were sent, by
the webhook and by the sweep. `/admin/shipmondo` says which mode the shop is in. Unset (or any other
value) means the default: sent at payment.

An order is sent **once**:
- One run sends an order at a time.
- The order's timeline records the send.
- Every sales order carries the tag `cartwright:<order id>`. A sales order already in Shipmondo is
  adopted only when it carries this order's tag, so a shared Shipmondo account with another
  webshop's order of the same number is safe.

Shipmondo's refusal is written on the order with its reason. The sweep then waits six hours before
trying that order again; *Send all* retries it at once.

What is sent:

| Field | Value |
|---|---|
| `order_id` | The order number the shop sees (`1042`), else the order id. |
| Addresses | Shipping and billing, in the shop's country (`brand.policies.country`). |
| Order lines | One line per item (SKU from the variant, the line or the product), plus a shipping line and a discount line. |
| Payment details | The charged total in the shop's base currency, with its VAT (`vat_percent` as Shipmondo writes it, `"0.25"` for 25 %). The payment reference or Stripe PaymentIntent is the transaction id. |

## How tracking comes back

Shipmondo answers a "Shipments: create" webhook at `/api/shipmondo/webhook`. It wants a `200`
within 3 seconds and documents no retries, so the route checks the signature and answers at once,
and the shipment is applied after the response. A delivery without a valid signature is refused
before anything else happens.

A shipment is applied only when **Shipmondo itself lists it** as an outbound fulfilment, not
cancelled, on the sales order this shop created. A return label never replaces the tracking, and
neither does another webshop's shipment in a shared account. Then:

- **The tracking is saved** (carrier and tracking number), the same way the admin's tracking form
  saves it.
- **The order moves to shipped**, if it was paid or processing, through the order state machine.
- **The customer gets the shipping email** with the tracking.

Each shipment is applied once:
- **A repeated delivery** changes nothing.
- **A second parcel** updates the tracking without a second email.
- **An older parcel that arrives late** never replaces newer tracking.

**Missed deliveries are fetched, not lost.** On every run the sweep asks Shipmondo for the
fulfilments of the orders it sent that still await shipment, or shipped in the last 14 days. It
applies any shipment it has not seen, through the same checks. Orders take turns, so ones that stay
unshipped cannot crowd out newer ones.

## Using Shipmondo's MCP alongside Cartwright

Shipmondo also offers an MCP server for AI assistants (`https://mcp.shipmondo.com/mcp`), and
Cartwright has its own (`/api/mcp`). With both connected, an assistant can:

- read an order in Cartwright (`orders.get`);
- book the shipment in Shipmondo;
- write the tracking back with `orders.set_tracking`. With `notifyCustomer: true` it also sends the
  shipping email.

This works without the plugin. The plugin makes it automatic.

## Reference

| Path | What it is |
|---|---|
| `plugins/shipmondo/manifest.ts` | The plugin, its files and route mounts. |
| `plugins/shipmondo/lib/client.ts` | Typed Shipmondo API v3 client (types generated from Shipmondo's OpenAPI by `pnpm gen:shipmondo-types`). |
| `plugins/shipmondo/lib/sales-order.ts` | Order → sales order. |
| `plugins/shipmondo/lib/send-order.ts` | Sending once; the sweep. |
| `plugins/shipmondo/lib/webhook.ts` | Webhook signature verification. |
| `plugins/shipmondo/lib/apply-shipment.ts` | Applying a shipment to its order. |
| `plugins/shipmondo/lib/reconcile.ts` | Fetching tracking a webhook missed. |
| `lib/orders/paid-hooks.ts` | The seam the plugin uses to act when an order is paid. |
