"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";

/**
 * Magic-link login form. Bruger Auth.js v5 EmailProvider — kunden indtaster
 * sin email og får et engangs-link i mailen. Klik = logget ind, ingen
 * password krævet. PreviewMailer skriver mailen til .mail-previews/ i dev.
 */
export default function MagicLinkForm({
  callbackUrl,
}: {
  /**
   * Where the emailed link should land the visitor. Already validated as a
   * same-origin path by the caller (`safeCallbackPath`) — this component does
   * NOT re-validate, so never pass a raw query value. Optional: `undefined`
   * leaves Auth.js on its own default, i.e. byte-identical to the behaviour
   * before this prop existed.
   */
  callbackUrl?: string;
}) {
  // Same namespace as LoginForm, which renders this component. The password
  // tab was translated and this one was not, so a Danish shop's login page was
  // half in each language.
  const t = useTranslations("Login");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("sending");
    setErrorMessage(null);

    try {
      const result = await signIn("email", {
        email: email.trim(),
        redirect: false,
        // Auth.js embeds this in the verification URL, so clicking the emailed
        // link is what finally returns the visitor to e.g. /oauth/authorize.
        // `undefined` is safe to pass: next-auth resolves the destination as
        // `callbackUrl ?? window.location.href` (node_modules/next-auth/
        // react.js, signIn), so no callbackUrl ⇒ today's exact default.
        callbackUrl,
      });

      if (result?.error) {
        setStatus("error");
        setErrorMessage(
          result.error.toLowerCase().includes("rate") ||
            result.error.toLowerCase().includes("mange")
            ? t("magicTooManyRequests")
            : t("magicGenericError"),
        );
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMessage(t("magicGenericError"));
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-black">{`✓ ${t("magicSentHeading")}`}</p>
        <p className="mt-1 leading-6">
          {t("magicSentBefore")}
          <strong>{email}</strong>
          {t("magicSentAfter")}
        </p>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-3 rounded-lg bg-white dark:bg-sol-sand px-3 py-2 font-mono text-xs text-sol-muted">
            Dev: email written to <code>.mail-previews/auth-link-*.html</code>
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
            setErrorMessage(null);
          }}
          className="mt-3 text-xs font-black uppercase tracking-widest text-sol-accent hover:underline"
        >
          {t("magicSendAnother")}
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-full border border-sol-ink/20 dark:border-white/20 bg-white dark:bg-sol-sand px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";

  const labelClass = "block text-sm font-bold text-sol-ink mb-1";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errorMessage && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="magic-link-email" className={labelClass}>
          {t("magicEmailLabel")}
        </label>
        <input
          id="magic-link-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <p className="text-xs leading-6 text-sol-muted">
        {t("magicHelp")}
      </p>

      <button
        type="submit"
        disabled={status === "sending" || !email.trim()}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "sending" ? t("magicSending") : t("magicSubmit")}
      </button>
    </form>
  );
}
