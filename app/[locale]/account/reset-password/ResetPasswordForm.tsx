"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { resetPasswordAction, type ResetState } from "./actions";

const INITIAL: ResetState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[var(--cw-brand-on-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand-on-dark)]/20";

export default function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Account");
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
          className="mt-5 inline-block font-bold text-[var(--cw-brand-on-dark)] transition-colors hover:text-[var(--cw-brand-on-dark-hi)]"
        >
          {t("resetForm_loginLink")}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-sm leading-relaxed text-white/80">
        <p className="font-bold text-red-400">{t("resetForm_missingToken")}</p>
        <p className="mt-2">
          {t("resetForm_missingTokenHelp")}{" "}
          <Link
            href="/account/forgot-password"
            className="font-bold text-[var(--cw-brand-on-dark)] hover:text-[var(--cw-brand-on-dark-hi)]"
          >
            {t("resetForm_requestNew")}
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
        {t("resetForm_newPassword")}
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
        {t("resetForm_confirmPassword")}
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
        className="w-full rounded-xl bg-[var(--cw-brand)] px-4 py-3 font-bold text-white transition hover:bg-[var(--cw-brand-deep)] disabled:opacity-60"
      >
        {pending ? t("resetForm_saving") : t("resetForm_submit")}
      </button>
    </form>
  );
}
