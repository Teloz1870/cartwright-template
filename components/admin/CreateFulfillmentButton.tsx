"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFulfillment } from "@/app/admin/ordrer/actions";

export default function CreateFulfillmentButton({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await createFulfillment(orderId);
        setMessage(res.ok ? "Fulfillment created" : res.error);
        if (res.ok) router.refresh();
      })();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={create}
        disabled={isPending}
        className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create fulfillment (suppliers)"}
      </button>
      {message && (
        <span className="text-sm font-bold text-sol-muted">{message}</span>
      )}
    </div>
  );
}
