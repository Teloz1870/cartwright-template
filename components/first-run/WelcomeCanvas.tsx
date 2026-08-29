import type { ComponentType } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/brand.config";
import { DESIGN_OPTIONS } from "@/designs/options";
import { DESIGN_MOTIFS } from "@/components/svg-items/design-motifs";
import {
  OrbitMark,
  PrismMark,
  ConstellationMark,
  CometMark,
  SunburstMark,
  LatticeMark,
  VineDivider,
  BloomIllustration,
  MountainIllustration,
  MothIllustration,
} from "@/components/svg-items";
import { CopyCommand } from "./CopyCommand";
import { WelcomeFlora } from "./WelcomeFlora";
import { CartwrightLogo } from "@/components/CartwrightLogo";

/**
 * First-run Welcome Canvas — the very first render of a fresh scaffold.
 *
 * Full showcase: a warm vermilion glass gradient hero with frosted-glass
 * floating ornaments (WelcomeFlora — butterflies, blossoms, bubbles, a glass
 * cube; pure CSS, prefers-reduced-motion-safe) and three action cards (build
 * with AI / guided setup / compose a look).
 *
 * Server Component. Gated by shouldShowWelcomeCanvas() (lib/first-run.ts) and
 * mounted from app/[locale]/page.tsx — it renders ONLY on a truly untouched
 * site and vanishes permanently once the owner makes the site theirs.
 * `data-first-run-welcome` on the root is the marker a deploy smoke test
 * asserts the ABSENCE of on a site that is already someone's.
 *
 * Colors are cw-* token classes WITHOUT `dark:` variants — the canvas is a
 * deterministic light-branded splash, identical in OS-light and OS-dark
 * (the dark-mode contract: only the explicit `.dark` switch may flip tokens).
 */

/** Signature-motif components by svg-item slug (subset used by DESIGN_MOTIFS). */
const MOTIF_COMPONENTS: Record<string, ComponentType<{ className?: string }>> = {
  "orbit-mark": OrbitMark,
  "prism-mark": PrismMark,
  "constellation-mark": ConstellationMark,
  "comet-mark": CometMark,
  "sunburst-mark": SunburstMark,
  "lattice-mark": LatticeMark,
  "vine-divider": VineDivider,
  "bloom-illustration": BloomIllustration,
  "mountain-illustration": MountainIllustration,
  "moth-illustration": MothIllustration,
};

/** The agent prompt the "Build it with AI" card copies to the clipboard. */
const AGENT_PROMPT =
  "Read DESIGN.md and design this whole site end to end — pick the path that fits, follow the taste rules, and verify with screenshots until it is stunning.";

const AI_QUICK_START_URL = "https://cartwright.app/docs/getting-started/ai-quick-start";

export default async function WelcomeCanvas() {
  const t = await getTranslations("Welcome");

  // Registry-driven motif gallery: registered designs ∩ designs with a
  // signature motif. A light-profile prune removes entries from
  // DESIGN_OPTIONS, so the strip automatically only shows what shipped.
  const motifDesigns = DESIGN_OPTIONS.filter(
    (o) => DESIGN_MOTIFS[o.slug] && MOTIF_COMPONENTS[DESIGN_MOTIFS[o.slug]],
  );

  return (
    <div
      data-first-run-welcome
      className="bg-cw-paper text-cw-stone-900"
    >
      {/* ── Hero banner: vivid Cartwright-vermilion gradient (the same nuance as
            the CTA buttons, for color cohesion), white type, frosted-glass
            ornaments. The "Three ways to begin" framing lives HERE at the
            bottom of the banner — anchored to the hero, not floating in the
            gap between sections — and the cards emerge just below. ─────────── */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(157deg,var(--cw-brand),var(--cw-brand-glow-1))]">
        <WelcomeFlora />
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-12 pb-16 text-center sm:pt-14 sm:pb-20">
          <a
            href="https://cartwright.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex flex-col items-center gap-2"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/70">
              {t("eyebrow")}
            </span>
            <CartwrightLogo
              dotColor="var(--cw-brand-ink)"
              dotGlow="rgba(255,255,255,0.4)"
              className="text-[2.1rem] text-white transition-transform duration-300 group-hover:-translate-y-0.5 sm:text-[2.9rem]"
            />
          </a>
          <h1 className="mt-4 max-w-2xl text-balance bg-gradient-to-br from-white via-[var(--cw-brand-tint-1)] to-[var(--cw-brand-tint-2)] bg-clip-text text-4xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-5xl">
            {t("headline")}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
            {t("sub")}
          </p>
          {/* Framing line: the numbered cards read as alternatives, not steps. */}
          <div className="mt-9 flex flex-col items-center gap-0.5">
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {t("waysTitle")}
            </h2>
            <p className="text-[13px] text-white/70">{t("waysHint")}</p>
          </div>
        </div>
      </section>

      {/* ── Three on-ramp cards — emerge just below the banner ───────────── */}
      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-6 pb-12">
        {/* One-shot staggered card entrance on first paint (cards are above the
            fold, so a scroll-driven reveal would never fire). Mirrors the
            WelcomeFlora server-<style> convention: everything — including the
            resting opacity:0 — lives INSIDE the no-preference query, so
            reduced-motion users get the cards at full opacity with no flash.
            `both` fill keeps each card hidden through its delay, then settled. */}
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            @keyframes cw-card-rise {
              from { opacity: 0; transform: translateY(16px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .cw-card-rise {
              opacity: 0;
              animation: cw-card-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            .cw-card-rise:nth-of-type(1) { animation-delay: 80ms; }
            .cw-card-rise:nth-of-type(2) { animation-delay: 200ms; }
            .cw-card-rise:nth-of-type(3) { animation-delay: 320ms; }
          }
        `}</style>
        <ol className="grid gap-4 lg:grid-cols-3">
          {/* 01 — Build it with AI */}
          <li className="cw-card-rise group/card flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-5 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[var(--cw-brand)]/40 hover:shadow-[0_44px_80px_-32px_var(--cw-brand-shadow-soft)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cw-brand)]">
                01
              </span>
              <span className="rounded-full bg-[var(--cw-brand)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-brand)]">
                {t("aiTag")}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight">{t("aiTitle")}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-cw-stone-600">{t("aiBody")}</p>
            <div className="mt-3">
              <CopyCommand
                text={AGENT_PROMPT}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            </div>
            <p className="mt-auto pt-4 text-sm">
              <a
                href={AI_QUICK_START_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-cw-stone-900 underline decoration-[var(--cw-brand)]/50 decoration-2 underline-offset-4 transition hover:decoration-[var(--cw-brand)]"
              >
                {t("aiLink")} →
              </a>
            </p>
          </li>

          {/* 02 — Guided setup */}
          <li className="cw-card-rise group/card flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-5 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[var(--cw-brand)]/40 hover:shadow-[0_44px_80px_-32px_var(--cw-brand-shadow-soft)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cw-brand)]">
                02
              </span>
              <span className="rounded-full bg-[var(--cw-brand)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-brand)]">
                {t("setupTag")}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight">{t("setupTitle")}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-cw-stone-600">{t("setupBody")}</p>
            <p className="mt-3 rounded-xl border border-cw-stone-200 bg-cw-paper px-3.5 py-2.5 text-[12px] leading-snug text-cw-stone-600">
              {t("setupHint", { email: brand.emails.admin })}
            </p>
            <p className="mt-auto pt-4">
              {/* Plain <a> (hard navigation): the welcome canvas is an i18n
                  storefront route; soft-navigating into the non-i18n /admin
                  context makes next-intl's client router loop on a blank page.
                  A full load crosses the boundary cleanly. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard nav across the storefront→admin boundary */}
              <a
                href="/admin/setup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--cw-brand)] to-[var(--cw-brand-glow-1)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_var(--cw-brand-shadow-strong)] transition hover:from-[var(--cw-brand-glow-2)] hover:to-[var(--cw-brand-glow-3)]"
              >
                {t("setupCta")} →
              </a>
            </p>
          </li>

          {/* 03 — Compose a look */}
          <li className="cw-card-rise group/card flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-5 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[var(--cw-brand)]/40 hover:shadow-[0_44px_80px_-32px_var(--cw-brand-shadow-soft)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cw-brand)]">
                03
              </span>
              <span className="rounded-full bg-[var(--cw-brand)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cw-brand)]">
                {t("looksTag")}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight">{t("looksTitle")}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-cw-stone-600">{t("looksBody")}</p>
            {motifDesigns.length > 0 && (
              <ul className="mt-3.5 grid grid-cols-5 gap-1.5" aria-label={t("looksTitle")}>
                {motifDesigns.map((o) => {
                  const Motif = MOTIF_COMPONENTS[DESIGN_MOTIFS[o.slug]];
                  return (
                    <li
                      key={o.slug}
                      title={o.name}
                      className="flex aspect-square items-center justify-center rounded-xl border border-cw-stone-200 bg-cw-paper p-2 transition hover:border-[var(--cw-brand)]/50 hover:bg-cw-stone-100"
                    >
                      <Motif className="h-full w-full" />
                      <span className="sr-only">{o.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-auto pt-4">
              {/* Plain <a> (hard navigation) — see the setup CTA above. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard nav across the storefront→admin boundary */}
              <a
                href="/admin/designs"
                className="inline-flex items-center gap-2 rounded-full border border-cw-stone-300 px-5 py-2.5 text-sm font-semibold text-cw-stone-900 transition hover:border-cw-stone-900"
              >
                {t("looksCta")} →
              </a>
            </p>
          </li>
        </ol>

        {/* Capability strip: reframes the task. A fresh owner sees a blank-ish
            page and assumes "build a website from scratch"; in fact the whole
            backend is already wired and running. These chips make that concrete
            so the job reads as "design the front", not "build everything". */}
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cw-stone-400">
            {t("runningTitle")}
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-2.5">
            {[t("capDb"), t("capAuth"), t("capAdmin"), t("capSeo"), t("capI18n")].map(
              (cap) => (
                <li
                  key={cap}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cw-stone-200 bg-cw-stone-50/80 px-3.5 py-1.5 text-[13px] font-medium text-cw-stone-700"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3.5 text-[var(--cw-brand)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                  {cap}
                </li>
              ),
            )}
          </ul>
        </div>
      </section>

      {/* ── Dedicated first-run footer — brand-matched, replaces the site
            footer while the welcome canvas is live (the :has() rule below
            hides [data-site-footer] so the two never stack or clash). ─────── */}
      {/* While the welcome canvas is live, keep the first run distraction-free.
          The canvas is a self-contained splash: it carries its own brand
          lockup (hero) and its own brand footer, so the shared chrome is pure
          noise here. Hide all three:
            • [data-site-header]     — empty on first-run (nav/admin/lang gated
                                       off via firstRunBrand); the hero logo is
                                       the brand, so a sticky bar adds nothing.
            • [data-site-footer]     — clashes with the dedicated brand footer.
            • [data-cw-ai-assistant] — the FAB is "AI OFFLINE" without a key and
                                       premature before the owner has a site.
          If :has() is unsupported (pre-Baseline-2023) these rules no-op: the
          header still degrades cleanly (its content is server-gated off via
          firstRunBrand), but the shared site footer would stack under the
          dedicated brand one and the AI FAB would show. Acceptable — this is
          first-run only (firstRunWelcome is engine-default-false, never on a
          canary) and the affected browser slice is vanishing. */}
      <style>{`:root:has([data-first-run-welcome]) :is([data-site-header],[data-site-footer],[data-cw-ai-assistant]){display:none !important}`}</style>
      <footer className="relative isolate overflow-hidden border-t border-[var(--cw-brand)]/15 bg-gradient-to-b from-cw-paper via-[var(--cw-brand)]/[0.04] to-[var(--cw-brand)]/[0.1]">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-1/2 -z-10 h-52 w-[40rem] -translate-x-1/2 rounded-full bg-[var(--cw-brand)]/25 blur-[100px]"
        />
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div className="flex max-w-sm flex-col items-center gap-3 sm:items-start">
              <CartwrightLogo className="text-2xl text-cw-stone-900" />
              <p className="text-sm leading-relaxed text-cw-stone-600">{t("sub")}</p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:items-end">
              <Link
                href="/built-with-cartwright"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--cw-brand)] to-[var(--cw-brand-glow-1)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_var(--cw-brand-shadow-strong)] transition hover:-translate-y-px hover:from-[var(--cw-brand-glow-2)] hover:to-[var(--cw-brand-glow-3)]"
              >
                {t("engine")} →
              </Link>
              <p className="max-w-[16rem] text-xs italic text-cw-stone-500 sm:text-right">{t("vanish")}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
