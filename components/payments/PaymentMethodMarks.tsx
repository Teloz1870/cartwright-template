import { ApplePayIcon } from "@/components/icons/payments/ApplePayIcon";
import { GooglePayIcon } from "@/components/icons/payments/GooglePayIcon";
import { MastercardIcon } from "@/components/icons/payments/MastercardIcon";
import { MobilePayIcon } from "@/components/icons/payments/MobilePayIcon";
import { StripeLinkIcon } from "@/components/icons/payments/StripeLinkIcon";
import { VisaIcon } from "@/components/icons/payments/VisaIcon";
import type { PaymentMethod } from "@/components/payments/types";

export const defaultPaymentMethods: PaymentMethod[] = [
  "visa",
  "mastercard",
  "mobilepay",
  "applepay",
  "googlepay",
  "stripe-link",
];

const iconByMethod = {
  visa: VisaIcon,
  mastercard: MastercardIcon,
  mobilepay: MobilePayIcon,
  applepay: ApplePayIcon,
  googlepay: GooglePayIcon,
  "stripe-link": StripeLinkIcon,
} satisfies Record<PaymentMethod, (props: { className?: string }) => React.ReactNode>;

const sizeClasses = {
  small: "h-6 w-10",
  medium: "h-8 w-13",
  large: "h-10 w-16",
} satisfies Record<"small" | "medium" | "large", string>;

/** The localized chrome around the logos. */
export type PaymentMethodLabels = {
  /** The "Secure payment" prefix, shown when `showPrefix` is set. */
  securePayment: string;
  /** aria-label for the logo row. */
  paymentMethodsAria: string;
};

export type PaymentMethodMarksProps = {
  size: "small" | "medium" | "large";
  methods?: PaymentMethod[];
  showPrefix?: boolean;
  className?: string;
  /**
   * Resolved by the CALLER, in the caller's own idiom: `getTranslations` in
   * the async server parent, `useTranslations` inside a client tree. This
   * component therefore holds no i18n context of its own and renders correctly
   * in both — including a test that renders it outside any next-intl provider.
   *
   * Required on purpose. It used to hardcode the Danish strings even though
   * `messages/{da,en}.json` already carried them, so an English shop announced
   * its payment row in Danish; a required prop makes that unrepresentable
   * rather than merely discouraged.
   */
  labels: PaymentMethodLabels;
};

export function PaymentMethodMarks({
  size,
  methods = defaultPaymentMethods,
  showPrefix = false,
  className = "",
  labels,
}: PaymentMethodMarksProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      aria-label={labels.paymentMethodsAria}
    >
      {showPrefix && (
        <span className="mr-1 text-xs font-black uppercase tracking-wide text-sol-muted">
          {labels.securePayment}
        </span>
      )}
      {methods.map((method) => {
        const Icon = iconByMethod[method];
        return <Icon key={method} className={sizeClasses[size]} />;
      })}
    </div>
  );
}
