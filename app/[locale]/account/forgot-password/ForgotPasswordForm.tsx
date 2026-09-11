"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestPasswordResetAction, type ForgotState } from "./actions";

const INITIAL: ForgotState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[var(--cw-brand-on-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand-on-dark)]/20";

export default function ForgotPasswordForm() {
  const t = useTranslations("Account");
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
          className="mt-5 inline-block font-bold text-[var(--cw-brand-on-dark)] transition-colors hover:text-[var(--cw-brand-on-dark-hi)]"
        >
          {t("forgotForm_backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-white/60">
        {t("forgotForm_intro")}
      </p>
      <label className="flex flex-col gap-1 text-sm font-bold text-white/80">
        {t("forgotForm_emailLabel")}
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder={t("forgotForm_emailPlaceholder")}
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
        className="w-full rounded-xl bg-[var(--cw-brand)] px-4 py-3 font-bold text-white transition hover:bg-[var(--cw-brand-deep)] disabled:opacity-60"
      >
        {pending ? t("forgotForm_submitting") : t("forgotForm_submit")}
      </button>

      <Link
        href="/account/login"
        className="text-center text-sm text-white/50 transition-colors hover:text-white/80"
      >
        {t("forgotForm_backToLogin")}
      </Link>
    </form>
  );
}
