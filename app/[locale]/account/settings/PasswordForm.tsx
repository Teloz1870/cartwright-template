"use client";

import { useActionState } from "react";
import { changeCustomerPassword, type PwState } from "./actions";

const INITIAL: PwState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(
    changeCustomerPassword,
    INITIAL,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {hasPassword && (
        <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
          Nuværende adgangskode
          <input
            type="password"
            name="current"
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
        Ny adgangskode
        <input
          type="password"
          name="next"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
        Gentag ny adgangskode
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm font-bold text-red-400">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="text-sm font-bold text-green-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-indigo-500 px-4 py-3 font-bold text-white transition hover:bg-indigo-400 disabled:opacity-60"
      >
        {pending
          ? "Gemmer…"
          : hasPassword
            ? "Skift adgangskode"
            : "Opret adgangskode"}
      </button>
    </form>
  );
}
