"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { brand } from "@/brand.config";
import { supportsDialog } from "@/lib/features";

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
 * Phase B4: when `brand.features.popoverApi` is on AND the browser
 * supports `HTMLDialogElement.showModal`, the modal renders as a native
 * `<dialog>` — the browser handles focus trap, Escape, and the ::backdrop
 * surface. Otherwise we fall back to the original React-state implementation
 * with a manual Escape listener and a click-through backdrop button.
 *
 * Behavior is identical in both modes: shows once per browser on a fresh
 * shop, points at /admin, never appears inside the admin area itself.
 */
export default function WelcomeGuide({ setupPending }: Props) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Browser support resolves only after mount — start false on first render
  // so SSR HTML matches the post-hydration markup, then flip on if support
  // is detected. Otherwise the dialog's open attribute would diverge.
  const [useNative, setUseNative] = useState(false);

  useEffect(() => {
    if (brand.features.popoverApi && supportsDialog()) {
      setUseNative(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable (private mode) — just close */
    }
    const dlg = dialogRef.current;
    if (dlg?.open) dlg.close();
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
    // localStorage is client-only, so the open decision must run after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [setupPending]);

  // Sync React `open` state with the native dialog element.
  useEffect(() => {
    if (!useNative) return;
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open, useNative]);

  // Fallback Escape handler — only needed in the React-state path; the
  // native `<dialog>` element handles Escape internally.
  useEffect(() => {
    if (useNative || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss, useNative]);

  // The modal points at /admin — pointless to show inside the admin area itself.
  if (pathname?.startsWith("/admin")) return null;

  if (useNative) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby="welcome-guide-title"
        onClose={() => {
          // Fires on Escape and explicit close()
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setOpen(false);
        }}
        onClick={(e) => {
          // Backdrop click closes — target equals the dialog element itself
          // only when the user clicked the ::backdrop surface, not a child.
          if (e.target === dialogRef.current) dismiss();
        }}
        className="m-auto w-full max-w-lg rounded-2xl bg-sol-cream p-7 shadow-2xl backdrop:bg-sol-accent-deep/55 backdrop:backdrop-blur-md"
      >
        <WelcomeBody onDismiss={dismiss} />
      </dialog>
    );
  }

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
        <WelcomeBody onDismiss={dismiss} />
      </div>
    </div>
  );
}

function WelcomeBody({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
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
          onClick={onDismiss}
          className="rounded-full bg-sol-accent px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90"
        >
          Open the setup wizard
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-sol-accent px-5 py-2.5 text-sm font-bold text-sol-accent transition hover:bg-sol-accent hover:text-white"
        >
          Dismiss
        </button>
      </div>
    </>
  );
}
