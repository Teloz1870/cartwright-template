# Multi-currency

Cartwright has two layers of currency support:

1. **Display only** (`currencySwitcher`) — show prices in the customer's currency, but still
   charge in the base currency.
2. **True multi-currency** (`multiCurrency`) — charge the customer in their selected currency and
   record it on the order.

## Base currency & rate table

Prices in the DB are stored as **base-currency minor units** (øre for `DKK`, cents for an
EUR/USD-based fork). The base currency and the static rate table live in `brand.config.ts`:

```ts
policies: {
  currency: "DKK", // base (ISO-4217)
  supportedCurrencies: {
    DKK: { rate: 1, label: "Danske kroner" },
    EUR: { rate: 0.134, label: "Euro" },
    USD: { rate: 0.145, label: "US Dollar" },
  },
}
```

Rates are **unit-per-1-base-unit** (1 DKK = 0.134 EUR). The base currency must have `rate: 1`.
Update them manually (e.g. quarterly) — an auto-refresh cron (`fxAutoUpdate`) is a planned follow-up.

## Enabling

1. Add ≥2 entries to `supportedCurrencies`.
2. Turn on `currencySwitcher` in `/admin/features` — a currency selector appears in the header
   (display only).
3. To also **charge** in the selected currency, turn on `multiCurrency` (it `dependsOn`
   `currencySwitcher` and needs ≥2 currencies).
4. **Run the migration before flipping `multiCurrency`** — the `Order` table gains `currency` +
   `fxRate`:
   ```bash
   pnpm db:push
   ```
   (`prisma migrate deploy` from-zero is known-broken — use `db push`.)
5. Your Stripe account must support the presentment currencies.

## What happens at checkout

- `getCheckoutCurrency()` resolves the presentment currency (the cookie set by the switcher, gated
  on `multiCurrency`).
- `convertMinor(totalDkk, currency)` (`lib/money.ts`) converts the base total to the presentment
  currency's minor units.
- The Stripe PaymentIntent is created in that currency with the converted amount.
- The order snapshots `currency` + `fxRate`; the confirmation email renders in that currency.
- The webhook verifies the paid amount against `round(totalDkk × fxRate)` in the order's currency.

## Notes / limits

- Display and charge share one conversion path (`lib/money.ts`), so the shown price always equals
  the charged price.
- Only 2-decimal currencies are supported today (DKK/EUR/USD/GBP/SEK/NOK). Adding a zero-decimal
  currency (JPY) throws a guard rather than silently mis-charging.
- Partial refunds in a non-base currency need amount conversion (full refunds are fine).
