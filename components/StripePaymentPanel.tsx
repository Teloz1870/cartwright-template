"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { brand } from "@/brand.config";

type Props = {
  /** Server-udstedt PaymentIntent client_secret (fra orders.create). */
  clientSecret: string;
  /** Stripe publishable key fra IntegrationSettings. */
  publishableKey: string;
  /** Total i øre for at vise klar pris på knap (DK lovkrav). */
  totalDkk: number;
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
  totalDkk,
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
      <StripeInnerForm totalDkk={totalDkk} orderId={orderId} />
    </Elements>
  );
}

function StripeInnerForm({
  totalDkk,
  orderId,
}: {
  totalDkk: number;
  orderId: string;
}) {
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
        return_url: `${window.location.origin}/ordre/${orderId}`,
      },
      redirect: "if_required", // Apple Pay/kort returnerer synkront, ingen redirect
    });

    if (result.error) {
      setStatus("error");
      setErrorMessage(
        result.error.message ?? "Betaling fejlede — prøv igen eller brug et andet kort.",
      );
      return;
    }

    // Hvis ingen redirect, betaling lykkedes synkront — redirect manuelt
    if (result.paymentIntent?.status === "succeeded") {
      setStatus("success");
      window.location.href = `/ordre/${orderId}`;
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 text-sm text-green-900">
        ✓ Betaling gennemført — henter din ordre...
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
          ? "Behandler betaling..."
          : `Betal ${(totalDkk / 100).toLocaleString("da-DK")} kr`}
      </button>
    </form>
  );
}
