"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDiscountCode, toggleDiscountCode } from "@/app/admin/actions";

type ToggleDiscountButtonProps = {
  id: string;
  active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function DiscountCodeForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      void (async () => {
        const result = await createDiscountCode(formData);

        if (result.ok) {
          form.reset();
          setMessage("Rabatkode oprettet");
          router.refresh();
          return;
        }

        setMessage(result.error);
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-[1fr_180px_180px]">
        <div>
          <label htmlFor="code" className={labelClass}>
            Kode
          </label>
          <input
            id="code"
            name="code"
            type="text"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="type" className={labelClass}>
            Type
          </label>
          <select id="type" name="type" className={inputClass} required>
            <option value="percent">Procent</option>
            <option value="fixed">Fast beløb</option>
          </select>
        </div>

        <div>
          <label htmlFor="value" className={labelClass}>
            Værdi
          </label>
          <input
            id="value"
            name="value"
            type="number"
            min="1"
            step="1"
            className={inputClass}
            required
          />
        </div>
      </div>

      <p className="mt-2 text-xs font-semibold text-sol-muted">
        Procent: tal mellem 1-100. Fast beløb: beløb i kroner.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {message ? (
          <p className="text-sm font-bold text-sol-muted">{message}</p>
        ) : (
          <span />
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Opretter…" : "Opret rabatkode"}
        </button>
      </div>
    </form>
  );
}

export function ToggleDiscountButton({ id, active }: ToggleDiscountButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      void (async () => {
        const result = await toggleDiscountCode(id);

        if (!result.ok) {
          alert(result.error);
          return;
        }

        router.refresh();
      })();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-sol-ink/15 px-3 py-1.5 text-xs font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {active ? "Deaktivér" : "Aktivér"}
    </button>
  );
}
