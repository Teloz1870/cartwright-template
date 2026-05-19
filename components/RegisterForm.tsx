"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/app/konto/actions";

export default function RegisterForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await registerUser(formData);
      if (res.ok) {
        router.push("/konto/login?oprettet=1");
      } else {
        setError(res.error);
      }
    });
  }

  const inputClass =
    "w-full rounded-full border border-sol-ink/20 bg-white px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";

  const labelClass = "block text-sm font-bold text-sol-ink mb-1";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3 text-red-700 font-semibold text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Navn
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Dit fulde navn"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="din@email.dk"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Adgangskode
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mindst 8 tegn"
          className={inputClass}
          required
          minLength={8}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Opretter…" : "Opret konto"}
      </button>
    </form>
  );
}
