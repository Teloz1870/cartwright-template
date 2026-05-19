"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/app/admin/actions";

type OrderStatusFormProps = {
  orderId: string;
  currentStatus: string;
};

const statuses = [
  { value: "pending", label: "Afventer" },
  { value: "paid", label: "Betalt" },
  { value: "shipped", label: "Afsendt" },
  { value: "cancelled", label: "Annulleret" },
];

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function OrderStatusForm({
  orderId,
  currentStatus,
}: OrderStatusFormProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(() => {
      void (async () => {
        const result = await updateOrderStatus(orderId, selectedStatus);

        if (result.ok) {
          setMessage("Status opdateret");
          router.refresh();
          return;
        }

        setMessage(result.error);
      })();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-xl font-black text-sol-ink">Opdatér status</h2>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className={inputClass}
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Opdaterer…" : "Opdatér"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm font-bold text-sol-muted">{message}</p>
      )}
    </form>
  );
}
