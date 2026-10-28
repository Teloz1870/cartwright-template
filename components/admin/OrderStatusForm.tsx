"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  isOrderStatus,
  isRefundStatus,
  legalNextStates,
  statusLabel,
  type OrderStatus,
} from "@/lib/orders/status";

type OrderStatusFormProps = {
  orderId: string;
  currentStatus: string;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

/**
 * The statuses this order may be moved to. A known status offers its legal
 * next steps from the operator state machine; a legacy string the machine
 * does not know may go to any status, which is what the server allows too
 * (`transitionCore` cannot validate a move out of an unknown state).
 */
export function statusOptions(currentStatus: string): readonly OrderStatus[] {
  return isOrderStatus(currentStatus) ? legalNextStates(currentStatus) : ORDER_STATUSES;
}

/**
 * The status control of the plain order page (the `orderWorkspace` flag off —
 * the default). It goes through the same server action as the workspace
 * timeline, so a move is checked against the state machine, leaves an order
 * note and is audited. It used to write `Order.status` directly, with a fixed
 * list of four statuses and no check: a refunded order could be set to paid.
 */
export default function OrderStatusForm({
  orderId,
  currentStatus,
}: OrderStatusFormProps) {
  const router = useRouter();
  const options = statusOptions(currentStatus);
  const [picked, setPicked] = useState<string>("");
  // The page refreshes in place after a change, so this component stays
  // mounted while `currentStatus` — and with it the options — moves on. What
  // the operator picked counts only while it is still an option; otherwise
  // the first option is both what the select shows and what is submitted.
  const target = (options as readonly string[]).includes(picked) ? picked : (options[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setMessage(null);

    // An async action, so `isPending` covers the request and the button
    // stays disabled until the answer is in: no second click mid-flight.
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateOrderStatusAdmin>>;
      try {
        result = await updateOrderStatusAdmin(orderId, target);
      } catch {
        // The action answers with a result; a throw is the request itself
        // failing. Say so here — an async transition that rejects would take
        // the whole page to the error boundary.
        setMessage("Could not reach the server. The status was not changed — try again.");
        return;
      }

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setMessage(
        isRefundStatus(target)
          ? "Status updated — recorded as manual, no money moved"
          : "Status updated",
      );
      // The pick is spent: the next status starts from its own first option.
      setPicked("");
      // Inside a transition of its own, so the button stays disabled until
      // the refreshed page (and the new options) are in.
      startTransition(() => router.refresh());
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
    >
      <h2 className="mb-4 text-xl font-black text-sol-ink">Update status</h2>

      {options.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="status" className={labelClass}>
              Change status from {statusLabel(currentStatus)} to
            </label>
            <select
              id="status"
              value={target}
              onChange={(event) => setPicked(event.target.value)}
              className={inputClass}
            >
              {options.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                  {isRefundStatus(status) ? " (manual — no money moved)" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Updating…" : "Update"}
          </button>
        </div>
      ) : (
        <p className="text-sm font-semibold text-sol-muted">
          This order is {statusLabel(currentStatus).toLowerCase()}. That is a final
          status, so it cannot be changed.
        </p>
      )}

      {message && (
        <p className="mt-3 text-sm font-bold text-sol-muted" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
