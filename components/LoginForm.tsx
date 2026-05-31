"use client";

import { useTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import MagicLinkForm from "@/components/MagicLinkForm";

type Tab = "password" | "magic-link";

const inputClass =
  "w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition";
const labelClass = "block text-sm font-bold text-white mb-1";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("password");

  const oprettet = searchParams.get("oprettet") === "1";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    startTransition(async () => {
      try {
        console.log("Attempting login with:", email);
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        
        console.log("Login result:", result);

        if (result?.error) {
          setError("Forkert email eller adgangskode.");
        } else if (result?.ok) {
          console.log("Login OK, redirecting...");
          window.location.href = "/account"; // Hard redirect to force navigation
        } else {
          setError("Der opstod en ukendt fejl. Prøv igen.");
        }
      } catch (err) {
        console.error("Login exception:", err);
        setError("Netværksfejl eller serverfejl. Se console.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {oprettet && (
        <div className="rounded-2xl border border-green-300 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700">
          Your account has been created. Log in
        </div>
      )}

      {/* Tabs: password vs magic-link */}
      <div className="flex gap-2 rounded-full bg-white/5 border border-white/10 p-1">
        <button
          type="button"
          onClick={() => setTab("password")}
          className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
            tab === "password"
              ? "bg-white text-black shadow-sm"
              : "text-white/50 hover:text-white"
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setTab("magic-link")}
          className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
            tab === "magic-link"
              ? "bg-white text-black shadow-sm"
              : "text-white/50 hover:text-white"
          }`}
        >
          Magic link
        </button>
      </div>

      {tab === "magic-link" ? <MagicLinkForm /> : <PasswordForm
        isPending={isPending}
        error={error}
        onSubmit={handleSubmit}
      />}
    </div>
  );
}

function PasswordForm({
  isPending,
  error,
  onSubmit,
}: {
  isPending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

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
          autoComplete="current-password"
          placeholder="Your password"
          className={inputClass}
          required
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-white px-6 py-4 text-base font-black tracking-wide text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Log ind..." : "Log ind"}
      </button>
    </form>
  );
}
