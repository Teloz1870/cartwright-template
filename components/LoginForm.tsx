"use client";

import { useTransition, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import MagicLinkForm from "@/components/MagicLinkForm";
import { safeCallbackPath } from "@/lib/safe-path";

type Tab = "password" | "magic-link";

const inputClass =
  "w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand)] transition";
const labelClass = "block text-sm font-bold text-white mb-1";

export default function LoginForm({
  githubEnabled = false,
  googleEnabled = false,
  emailEnabled = true,
  devNoEmail = false,
}: {
  /** Show "Continue with GitHub" — true only when the flag + OAuth keys are set. */
  githubEnabled?: boolean;
  /** Show "Continue with Google" — true only when the flag + OAuth keys are set. */
  googleEnabled?: boolean;
  /**
   * Is email delivery configured (Resend key set)? When false we hide the
   * magic-link tab + "forgot password" link — neither can deliver, so offering
   * them is a dead end. Defaults true so callers that don't pass it keep the
   * old behavior. The login page passes the real value.
   */
  emailEnabled?: boolean;
  /**
   * Dev-only first-run helper (non-production + email unconfigured): render a
   * hint pointing to the seeded password in .admin-credentials. Never shown in
   * production — the login page computes the gate.
   */
  devNoEmail?: boolean;
}) {
  const t = useTranslations("Login");
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("password");

  const oprettet = searchParams.get("oprettet") === "1";

  /**
   * Where to land after a successful sign-in. Three routes send a signed-out
   * visitor here with a `?callbackUrl=`: `/oauth/authorize` (UCP identity
   * linking), the subscription checkout, and the reviews plugin's
   * "review your order" link. Every one of them was silently dropped — the
   * form always hard-navigated to `/account`, so an authorization-code flow
   * could only ever complete for an already-signed-in user.
   *
   * `safeCallbackPath` returns `undefined` for an absent OR off-origin value,
   * so each branch below keeps its own historical default via `??`. No
   * `callbackUrl` in the URL ⇒ this component behaves exactly as before.
   */
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));

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
          setError(t("errWrong"));
        } else if (result?.ok) {
          console.log("Login OK, redirecting...");
          // Hard redirect on purpose: a soft nav keeps the pre-login RSC
          // payload, so the fresh session is not visible on the destination.
          // NOTE for whoever reads the lint output: @next/next/no-location-
          // assign-relative-destination flagged this line while the value was
          // the literal "/account" and no longer does, because it cannot see
          // through `??`. The rule's advice was not adopted — the hard redirect
          // is the fix for a real bug (see storefront→admin soft-nav loop) — so
          // do not read the warning's disappearance as it having been resolved.
          window.location.href = callbackUrl ?? "/account";
        } else {
          setError(t("errUnknown"));
        }
      } catch (err) {
        console.error("Login exception:", err);
        setError(t("errNetwork"));
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

      {/* Tabs: password vs magic-link. Magic-link is hidden when email isn't
          configured — it can't deliver, so password-only is the honest UI. */}
      {emailEnabled && (
        <div
          role="tablist"
          aria-label={t("methodAria")}
          className="flex gap-2 rounded-full bg-white/5 border border-white/10 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "password"}
            onClick={() => setTab("password")}
            className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              tab === "password"
                ? "bg-white text-black shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "magic-link"}
            onClick={() => setTab("magic-link")}
            className={`flex-1 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              tab === "magic-link"
                ? "bg-white text-black shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            Magic link
          </button>
        </div>
      )}

      {emailEnabled && tab === "magic-link" ? (
        <MagicLinkForm callbackUrl={callbackUrl} />
      ) : (
        <PasswordForm
          isPending={isPending}
          error={error}
          emailEnabled={emailEnabled}
          devHint={devNoEmail}
          onSubmit={handleSubmit}
        />
      )}

      {(githubEnabled || googleEnabled) && (
        <>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/30">
            <span className="h-px flex-1 bg-white/10" />
            {t("orSeparator")}
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="space-y-3">
            {githubEnabled && (
              <button
                type="button"
                onClick={() => signIn("github", { callbackUrl: callbackUrl ?? "/account" })}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                Continue with GitHub
              </button>
            )}
            {googleEnabled && (
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: callbackUrl ?? "/account" })}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.46-1.14 2.7-2.41 3.53v2.95h3.8c2.22-2.05 3.63-5.08 3.63-8.72z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.8-2.95c-1.05.7-2.4 1.12-4.15 1.12-3.13 0-5.78-2.11-6.72-4.96H1.36v3.04A11.99 11.99 0 0012 24z" />
                  <path fill="#FBBC05" d="M5.28 14.3A7.21 7.21 0 014.9 12c0-.8.14-1.58.38-2.3V6.66H1.36A11.96 11.96 0 000 12c0 1.94.46 3.78 1.36 5.34l3.92-3.04z" />
                  <path fill="#EA4335" d="M12 4.74c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.96 1.16 15.24 0 12 0A11.99 11.99 0 001.36 6.66L5.28 9.7C6.22 6.85 8.87 4.74 12 4.74z" />
                </svg>
                {t("continueGoogle")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PasswordForm({
  isPending,
  error,
  emailEnabled,
  devHint = false,
  onSubmit,
}: {
  isPending: boolean;
  error: string | null;
  emailEnabled: boolean;
  devHint?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Login");
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
        >
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
          placeholder={t("passwordPlaceholder")}
          className={inputClass}
          required
        />
      </div>

      {emailEnabled && (
        <div className="-mt-2 text-right">
          <Link
            href={`/${locale}/account/forgot-password`}
            className="text-sm font-bold text-[var(--cw-brand-glow-1)] transition hover:text-white"
          >
            {t("forgotPassword")}
          </Link>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-[var(--cw-brand)] px-6 py-4 text-base font-black tracking-wide text-white transition hover:bg-[var(--cw-brand-deep)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? t("signingIn") : t("signIn")}
      </button>

      {devHint && (
        <p className="text-center text-xs leading-relaxed text-white/40">
          First run? Your generated admin password is in{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/70">
            .admin-credentials
          </code>{" "}
          at the project root (or the{" "}
          <code className="font-mono text-white/70">prisma db seed</code> output).
          Sign in with the admin email from{" "}
          <code className="font-mono text-white/70">brand.config.ts</code>.
        </p>
      )}
    </form>
  );
}
