"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminButton } from "@/components/admin/ui";
import { activatePlusAction } from "./actions";

/**
 * "Enable Plus features" button — shown only when the server already resolved
 * the key as verified-active AND the cartwrightPlus flag is still off. The
 * server action re-verifies before flipping (never trust the client).
 */
export function ActivateButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onActivate() {
    setError(null);
    startTransition(async () => {
      const res = await activatePlusAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <AdminButton onClick={onActivate} loading={pending} disabled={pending}>
        Enable Plus features
      </AdminButton>
      {error && (
        <span className="text-xs leading-tight text-red-600">{error}</span>
      )}
    </div>
  );
}
