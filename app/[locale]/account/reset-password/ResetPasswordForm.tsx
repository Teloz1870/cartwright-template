"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type ResetState } from "./actions";

const INITIAL: ResetState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    INITIAL,
  );

  if (state.status === "success") {
    return (
      <div className="text-sm text-white/80">
        <p className="font-bold text-green-400">{state.message}</p>
        <Link
          href="/account/login"
          className="mt-5 inline-block font-bold text-indigo-400 transition-colors hover:text-indigo-300"
        >
          Log ind →
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-sm leading-relaxed text-white/80">
        <p className="font-bold text-red-400">Manglende reset-token.</p>
        <p className="mt-2">
          Åbn linket fra din email igen, eller{" "}
          <Link
            href="/account/forgot-password"
            className="font-bold text-indigo-400 hover:text-indigo-300"
          >
            bed om et nyt
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
        Ny adgangskode
        <input
          type="password"
          name="password"
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

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-bold text-white transition hover:bg-indigo-400 disabled:opacity-60"
      >
        {pending ? "Gemmer…" : "Sæt ny adgangskode"}
      </button>
    </form>
  );
}
