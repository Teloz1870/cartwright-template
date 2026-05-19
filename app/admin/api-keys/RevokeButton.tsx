"use client";

import { useTransition } from "react";
import { revokeApiKeyAction } from "./actions";

export default function RevokeButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        `Revoker '${name}'? Eventuelle aktive klienter mister adgang øjeblikkeligt.`,
      )
    ) {
      return;
    }
    startTransition(() => revokeApiKeyAction(id));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-full border border-red-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
    >
      {pending ? "…" : "Revoker"}
    </button>
  );
}
