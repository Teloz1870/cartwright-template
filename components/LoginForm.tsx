"use client";

import { useTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import MagicLinkForm from "@/components/MagicLinkForm";

type Tab = "password" | "magic-link";

const inputClass =
  "w-full rounded-full border border-sol-ink/20 bg-white px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";
const labelClass = "block text-sm font-bold text-sol-ink mb-1";

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
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Forkert e-mail eller adgangskode");
      } else {
        router.push("/konto");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {oprettet && (
        <div className="rounded-2xl border border-green-300 bg-green-50 px-5 py-3 text-sm font-semibold text-green-700">
          Din konto er oprettet — log ind
        </div>
      )}

      {/* Tabs: password vs magic-link */}
      <div className="flex gap-2 rounded-full bg-sol-sand p-1">
        <button
          type="button"
          onClick={() => setTab("password")}
          className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
            tab === "password"
              ? "bg-white text-sol-ink shadow-sm"
              : "text-sol-muted hover:text-sol-ink"
          }`}
        >
          Med password
        </button>
        <button
          type="button"
          onClick={() => setTab("magic-link")}
          className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
            tab === "magic-link"
              ? "bg-white text-sol-ink shadow-sm"
              : "text-sol-muted hover:text-sol-ink"
          }`}
        >
          Magic-link
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
          autoComplete="current-password"
          placeholder="Din adgangskode"
          className={inputClass}
          required
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Logger ind…" : "Log ind"}
      </button>
    </form>
  );
}
