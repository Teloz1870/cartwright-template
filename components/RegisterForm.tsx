"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/app/[locale]/account/actions";

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
        router.push("/account/login?oprettet=1");
      } else {
        setError(res.error);
      }
    });
  }

  const inputClass =
    "w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition";

  const labelClass = "block text-sm font-bold text-white mb-1";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3 text-red-700 font-semibold text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={inputClass}
          required
          minLength={8}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-white px-6 py-4 text-base font-black tracking-wide text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}
