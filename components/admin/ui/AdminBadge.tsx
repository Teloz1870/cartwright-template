import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isOrderStatus, type OrderStatus } from "@/lib/orders/status";

/**
 * AdminBadge — Polaris semantic status pill. Subtle tint + readable text,
 * with dark-mode variants. Replaces the raw `bg-green-100 text-green-800` spans
 * in the admin JSX (they were not sol tokens → the skin override never reached
 * them, and they looked oversaturated on pure white). Use `orderStatusTone()`
 * for order statuses.
 */
export type BadgeTone =
  | "success"
  | "attention"
  | "warning"
  | "critical"
  | "info"
  | "neutral";

const TONES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-sky-50 text-sky-700",
  attention: "bg-amber-50 text-amber-700",
  warning: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
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

/** Map an order status → badge tone (replaces using the raw STATUS_COLORS). */
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
