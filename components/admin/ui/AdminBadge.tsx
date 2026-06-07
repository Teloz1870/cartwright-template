import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isOrderStatus, type OrderStatus } from "@/lib/orders/status";

/**
 * AdminBadge — Polaris semantic status-pill. Subtil tint + læsbar tekst,
 * med dark-mode-varianter. Erstatter de rå `bg-green-100 text-green-800`-spans
 * i admin-JSX (de var ikke sol-tokens → skin-override nåede dem ikke, og de så
 * for mættede ud på rent hvid). Brug `orderStatusTone()` til ordre-statuses.
 */
export type BadgeTone =
  | "success"
  | "attention"
  | "warning"
  | "critical"
  | "info"
  | "neutral";

const TONES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  attention: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  warning: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

export default function AdminBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map ordre-status → badge-tone (afløser brug af STATUS_COLORS rå-farver). */
const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: "attention",
  pending: "attention",
  paid: "success",
  flagged_review: "warning",
  processing: "info",
  shipped: "info",
  delivered: "info",
  completed: "success",
  cancelled: "critical",
  refunded: "neutral",
  partial_refund: "neutral",
  disputed: "critical",
};

export function orderStatusTone(status: string): BadgeTone {
  return isOrderStatus(status) ? STATUS_TONE[status] : "neutral";
}
