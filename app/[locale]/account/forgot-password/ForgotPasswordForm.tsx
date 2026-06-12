"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type ForgotState } from "./actions";

const INITIAL: ForgotState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL,
  );

  if (state.status === "sent") {
    return (
      <div className="text-sm leading-relaxed text-white/80">
        <p>{state.message}</p>
        <Link
          href="/account/login"
          className="mt-5 inline-block font-bold text-indigo-400 transition-colors hover:text-indigo-300"
        >
          ← Tilbage til login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-white/60">
        Indtast din email, så sender vi et link til at vælge en ny adgangskode.
      </p>
      <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="dig@eksempel.dk"
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
        {pending ? "Sender…" : "Send reset-link"}
      </button>

      <Link
        href="/account/login"
        className="text-center text-sm text-white/50 transition-colors hover:text-white/80"
      >
        ← Tilbage til login
      </Link>
    </form>
  );
}
