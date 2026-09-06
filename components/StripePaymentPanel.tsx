"use client";

// The pay button shows THE AMOUNT STRIPE CHARGES, in the currency it charges
// it in — both handed down from the server that created the PaymentIntent.
//
// It has been wrong twice. First it hard-coded `toLocaleString("da-DK")`, so an
// English shopper saw Danish digit grouping on the one number that matters
// most. Then it used `formatPriceDkk(totalDkk)`, which always renders the BASE
// currency: with multiCurrency on, the customer read one figure and the card
// was charged another. Re-deriving the number on the client is what made both
// possible, so it is no longer derived here at all.
import { formatPrice } from "@/lib/format";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { brand } from "@/brand.config";

type Props = {
  /** Server-udstedt PaymentIntent client_secret (fra orders.create). */
  clientSecret: string;
  /** Stripe publishable key fra IntegrationSettings. */
  publishableKey: string;
  /**
   * The amount Stripe charges, and the currency it charges in — BOTH from the
   * server that created the PaymentIntent. Deliberately not `totalDkk`: that
   * is the base-currency ledger figure, and re-deriving the displayed number
   * on the client is what let the button disagree with the charge twice.
   */
  chargeAmountMinor: number;
  chargeCurrency: string;
  /** Ordre-id, brugt til redirect efter success. */
  orderId: string;
};

// Stripe-instance cached per publishableKey for at undgå at re-loade Stripe.js
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(key: string) {
  let p = stripePromiseCache.get(key);
  if (!p) {
    p = loadStripe(key);
    stripePromiseCache.set(key, p);
  }
  return p;
}

/**
 * Stripe Payment Element wrapper. Rendres inde i PlanCard når Stripe er
 * konfigureret. Express Checkout (Apple Pay, Google Pay, Link, MobilePay)
 * inkluderes automatisk i PaymentElement via `automatic_payment_methods`.
 */
export default function StripePaymentPanel({
  clientSecret,
  publishableKey,
  chargeAmountMinor,
  chargeCurrency,
  orderId,
}: Props) {
  const stripePromise = useMemo(
    () => getStripePromise(publishableKey),
    [publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: brand.stripeAppearance,
        },
      }}
    >
      <StripeInnerForm
        chargeAmountMinor={chargeAmountMinor}
        chargeCurrency={chargeCurrency}
        orderId={orderId}
      />
    </Elements>
  );
}

function StripeInnerForm({
  chargeAmountMinor,
  chargeCurrency,
  orderId,
}: {
  chargeAmountMinor: number;
  chargeCurrency: string;
  orderId: string;
}) {
  const t = useTranslations("Checkout");
  const locale = useLocale();
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<
    "idle" | "submitting" | "error" | "success"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setStatus("submitting");
    setErrorMessage(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/${orderId}`,
      },
      redirect: "if_required", // Apple Pay/kort returnerer synkront, ingen redirect
    });

    if (result.error) {
      setStatus("error");
      setErrorMessage(
        result.error.message ?? t("paymentFailed"),
      );
      return;
    }

    // Hvis ingen redirect, betaling lykkedes synkront — redirect manuelt
    if (result.paymentIntent?.status === "succeeded") {
      setStatus("success");
      router.push(`/order/${orderId}`);
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 text-sm text-green-900">
        {t("paymentComplete")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />

      {errorMessage && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || status === "submitting"}
        className="w-full rounded-full bg-sol-accent px-6 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {status === "submitting"
          ? t("processingPayment")
          : t("payAmount", {
              amount: formatPrice(chargeAmountMinor, {
                currency: chargeCurrency,
                locale,
                // The server already converted; formatting must NOT convert a
                // second time. An explicit empty override defeats the module
                // cache, which `undefined` would consult.
                fxRateOverrides: { fetchedAt: "", rates: {} },
              }),
            })}
      </button>
    </form>
  );
}
