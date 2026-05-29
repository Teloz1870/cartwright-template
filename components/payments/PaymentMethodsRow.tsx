import { isStripeReady } from "@/lib/stripe";
import {
  defaultPaymentMethods,
  PaymentMethodMarks,
  type PaymentMethodMarksProps,
} from "@/components/payments/PaymentMethodMarks";
import type { PaymentMethod } from "@/components/payments/types";

type Props = PaymentMethodMarksProps & {
  methods?: PaymentMethod[];
};

/**
 * Renders accepted payment method marks when Stripe is ready, otherwise shows a demo-mode notice.
 */
export default async function PaymentMethodsRow({
  size,
  methods = defaultPaymentMethods,
  showPrefix = false,
  className = "",
}: Props) {
  const stripeReady = await isStripeReady();

  if (!stripeReady) {
    return (
      <div
        className={`inline-flex items-center rounded-pill border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-900 ${className}`}
      >
        Demo-mode
      </div>
    );
  }

  return (
    <PaymentMethodMarks
      size={size}
      methods={methods}
      showPrefix={showPrefix}
      className={className}
    />
  );
}
