"use client";

import { useEffect, useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { registerUser } from "@/app/[locale]/account/actions";
import { localeHref } from "@/lib/urls";
import {
  REGISTER_ELAPSED_FIELD,
  REGISTER_HONEYPOT_FIELD,
} from "@/lib/auth/register-guard";

export default function RegisterForm() {
  const router = useRouter();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Set after hydration (not during render) so server and client markup match.
  const mountedAt = useRef<number | null>(null);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set(
      REGISTER_ELAPSED_FIELD,
      String(mountedAt.current === null ? 0 : Date.now() - mountedAt.current),
    );

    startTransition(async () => {
      const res = await registerUser(formData);
      if (res.ok) {
        // In the language the form was read in, at the address the shop
        // serves it (REG-LOGIN-LOCALE): a bare path cost a redirect and left
        // the language to the proxy's guess, so a visitor reading a second
        // language could land on the default one.
        router.push(localeHref("/account/login?oprettet=1", locale));
      } else {
        setError(res.error);
      }
    });
  }

  const inputClass =
    "w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand)] transition";

  const labelClass = "block text-sm font-bold text-white mb-1";

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="space-y-5">
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3 text-red-700 font-semibold text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          className={inputClass}
          required
        />
      </div>

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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={inputClass}
          required
          minLength={8}
        />
      </div>

      {/* Honeypot (lib/auth/register-guard.ts): off-screen, out of the tab
          order and hidden from assistive tech, so only a bot fills it. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
      >
        <label htmlFor={REGISTER_HONEYPOT_FIELD}>Leave this field empty</label>
        <input
          id={REGISTER_HONEYPOT_FIELD}
          name={REGISTER_HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-white px-6 py-4 text-base font-black tracking-wide text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}
