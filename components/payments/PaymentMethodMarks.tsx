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

export type PaymentMethodMarksProps = {
  size: "small" | "medium" | "large";
  methods?: PaymentMethod[];
  showPrefix?: boolean;
  className?: string;
};

export function PaymentMethodMarks({
  size,
  methods = defaultPaymentMethods,
  showPrefix = false,
  className = "",
}: PaymentMethodMarksProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      aria-label="Accepterede betalingsmetoder"
    >
      {showPrefix && (
        <span className="mr-1 text-xs font-black uppercase tracking-wide text-sol-muted">
          Sikker betaling
        </span>
      )}
      {methods.map((method) => {
        const Icon = iconByMethod[method];
        return <Icon key={method} className={sizeClasses[size]} />;
      })}
    </div>
  );
}
