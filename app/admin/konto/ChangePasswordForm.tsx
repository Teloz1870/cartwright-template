"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changeAdminPassword, type ChangePwState } from "./actions";

const INITIAL: ChangePwState = { status: "idle" };

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-sol-cream px-3 py-2 text-sm text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/20";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changeAdminPassword,
    INITIAL,
  );

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-green-600/20 bg-green-50 p-4 text-sm text-green-800">
        <p className="font-bold">{state.message}</p>
        <Link
          href="/admin"
          className="mt-2 inline-block font-bold text-sol-accent underline"
        >
          Til dashboard →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-bold text-sol-ink">
        Nuværende adgangskode
        <input
          type="password"
          name="current"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold text-sol-ink">
        Ny adgangskode
        <input
          type="password"
          name="next"
          autoComplete="new-password"
          required
          minLength={12}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold text-sol-ink">
        Gentag ny adgangskode
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={12}
          className={inputClass}
        />
      </label>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-60"
      >
        {pending ? "Gemmer…" : "Skift adgangskode"}
      </button>
    </form>
  );
}
