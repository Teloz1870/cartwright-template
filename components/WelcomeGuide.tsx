"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const DISMISS_KEY = "cartwright:welcome-dismissed";

type Props = {
  /**
   * True only on a fresh, unconfigured shop (from shouldShowSetupWizard).
   * Once the owner finishes setup this turns false and the modal never shows.
   */
  setupPending: boolean;
};

/**
 * First-visit welcome modal for a freshly-scaffolded Cartwright shop.
 *
 * Shows once per browser (a localStorage flag) while the shop is still
 * unconfigured — it points the new owner at the admin area and the setup
 * wizard. It never appears once setup is complete, so real customers of a
 * configured shop do not see it. Disable per-fork via brand.features.welcomeGuide.
 */
export default function WelcomeGuide({ setupPending }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable (private mode) — just close */
    }
    setOpen(false);
  }, []);

  // Open once, on a fresh shop, if this browser has not dismissed it before.
  useEffect(() => {
    if (!setupPending) return;
    let dismissed = true;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) !== null;
    } catch {
      /* storage unavailable — keep the modal hidden rather than risk a loop */
    }
    if (dismissed) return;
    // localStorage is client-only, so the open decision must run after mount;
    // a setState here is the intended pattern (no SSR hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [setupPending]);

  // Escape closes the modal (and records the dismissal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  // The modal points at /admin — pointless to show inside the admin area itself.
  if (pathname?.startsWith("/admin")) return null;
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-guide-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 bg-sol-accent-deep/55 backdrop-blur-md"
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-sol-cream p-7 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-sol-accent">
          Cartwright
        </p>
        <h2
          id="welcome-guide-title"
          className="mt-1 text-2xl font-black tracking-tight text-sol-ink"
        >
          Welcome to your shop 👋
        </h2>
        <p className="mt-2 text-sm text-sol-muted">
          What you see here is your storefront. Everything behind it — products,
          orders, theme and payments — is managed in the admin area.
        </p>
        <ul className="mt-4 flex flex-col gap-2.5 text-sm text-sol-ink">
          <li className="flex gap-2">
            <span aria-hidden className="font-black text-sol-accent">
              →
            </span>
            <span>
              <strong>/admin</strong> — your dashboard for products, orders,
              pages and theme.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="font-black text-sol-accent">
              →
            </span>
            <span>
              The <strong>setup wizard</strong> walks you through branding,
              theme, AI and your first category — about five minutes.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="font-black text-sol-accent">
              →
            </span>
            <span>
              Sign in with the seeded admin account (shown in your{" "}
              <code className="rounded bg-sol-sand px-1 text-xs">
                prisma db seed
              </code>{" "}
              output).
            </span>
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/setup"
            onClick={dismiss}
            className="rounded-full bg-sol-accent px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90"
          >
            Open the setup wizard
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-sol-accent px-5 py-2.5 text-sm font-bold text-sol-accent transition hover:bg-sol-accent hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
