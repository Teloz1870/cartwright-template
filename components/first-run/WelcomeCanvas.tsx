import type { ComponentType } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/brand.config";
import { ThreeHero } from "@/components/ThreeHero";
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
import type { SceneId } from "@/lib/three/types";

/**
 * First-run Welcome Canvas — the very first render of a fresh scaffold.
 *
 * Full showcase: forced-on aurora hero (scoped via `data-motion-scope` so the
 * global data-motion/motionEffects semantics are untouched — see
 * themes/motion.css), optional 3D hero when `brand.features.threeD` is on,
 * and three action cards (build with AI / guided setup / compose a look).
 *
 * Server Component. Gated by shouldShowWelcomeCanvas() (lib/first-run.ts) and
 * mounted from app/[locale]/page.tsx — it renders ONLY on a truly untouched
 * site and vanishes permanently once the owner makes the site theirs.
 * `data-first-run-welcome` on the root is the smoke-test marker
 * (scripts/smoke-canaries.sh asserts its ABSENCE on all three canaries).
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
  "Read DESIGN.md and design this site end to end. Pick the path that fits: compose a look, mockup first, or a completely unique design on the Blank Canvas. Follow the taste rules and verify your work with screenshots until it is stunning.";

const AI_QUICK_START_URL = "https://cartwright.app/docs/getting-started/ai-quick-start";

export default async function WelcomeCanvas({
  threeD,
}: {
  threeD?: { enabled: boolean; scene: SceneId; intensity: number };
}) {
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
      data-motion-scope="bold"
      className="bg-cw-paper text-cw-stone-900"
    >
      {/* ── Hero: scoped aurora glow + optional self-gating 3D canvas ────── */}
      <section className="motion-aurora-bg relative isolate overflow-hidden">
        {threeD?.enabled && (
          <ThreeHero
            scene={threeD.scene}
            intensity={threeD.intensity}
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-60"
          />
        )}
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 pb-28 text-center sm:pt-32 sm:pb-36">
          <p className="inline-flex items-center gap-2 rounded-full border border-cw-stone-200 bg-cw-paper/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cw-stone-600">
            <span aria-hidden className="size-1.5 rounded-full bg-cw-terracotta" />
            {t("eyebrow")}
          </p>
          <h1 className="mt-8 max-w-3xl text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-7xl">
            {t("headline")}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-cw-stone-600 sm:text-lg">
            {t("sub")}
          </p>
        </div>
      </section>

      {/* ── Three on-ramps — pulled up over the hero glow ────────────────── */}
      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-6 pb-16 sm:-mt-16">
        <ol className="grid gap-5 lg:grid-cols-3">
          {/* 01 — Build it with AI */}
          <li className="flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-7 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cw-terracotta">
              01
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{t("aiTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-600">{t("aiBody")}</p>
            <div className="mt-5">
              <CopyCommand
                text={AGENT_PROMPT}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            </div>
            <p className="mt-auto pt-5 text-sm">
              <a
                href={AI_QUICK_START_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-cw-stone-900 underline decoration-cw-terracotta/50 decoration-2 underline-offset-4 transition hover:decoration-cw-terracotta"
              >
                {t("aiLink")} →
              </a>
            </p>
          </li>

          {/* 02 — Guided setup */}
          <li className="flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-7 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cw-terracotta">
              02
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{t("setupTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-600">{t("setupBody")}</p>
            <p className="mt-5 rounded-xl border border-cw-stone-200 bg-cw-paper px-4 py-3 text-[12px] leading-relaxed text-cw-stone-600">
              {t("setupHint", { email: brand.emails.admin })}
            </p>
            <p className="mt-auto pt-5">
              <Link
                href="/admin/setup"
                className="inline-flex items-center gap-2 rounded-full bg-cw-stone-900 px-5 py-2.5 text-sm font-semibold text-cw-stone-50 transition hover:bg-cw-stone-700"
              >
                {t("setupCta")} →
              </Link>
            </p>
          </li>

          {/* 03 — Compose a look */}
          <li className="flex flex-col rounded-3xl border border-cw-stone-200 bg-cw-stone-50/95 p-7 shadow-[0_30px_70px_-36px_rgba(23,20,17,0.4)] backdrop-blur">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cw-terracotta">
              03
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{t("looksTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cw-stone-600">{t("looksBody")}</p>
            {motifDesigns.length > 0 && (
              <ul className="mt-5 grid grid-cols-5 gap-2" aria-label={t("looksTitle")}>
                {motifDesigns.map((o) => {
                  const Motif = MOTIF_COMPONENTS[DESIGN_MOTIFS[o.slug]];
                  return (
                    <li
                      key={o.slug}
                      title={o.name}
                      className="flex aspect-square items-center justify-center rounded-xl border border-cw-stone-200 bg-cw-paper p-2 transition hover:border-cw-terracotta/50 hover:bg-cw-stone-100"
                    >
                      <Motif className="h-full w-full" />
                      <span className="sr-only">{o.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-auto pt-5">
              <Link
                href="/admin/designs"
                className="inline-flex items-center gap-2 rounded-full border border-cw-stone-300 px-5 py-2.5 text-sm font-semibold text-cw-stone-900 transition hover:border-cw-stone-900"
              >
                {t("looksCta")} →
              </Link>
            </p>
          </li>
        </ol>
      </section>

      {/* ── Vanishing note ───────────────────────────────────────────────── */}
      <section className="border-t border-cw-stone-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm italic text-cw-stone-500">{t("vanish")}</p>
          <Link
            href="/built-with-cartwright"
            className="text-sm font-semibold text-cw-stone-900 underline decoration-cw-stone-300 decoration-2 underline-offset-4 transition hover:decoration-cw-terracotta"
          >
            {t("engine")} →
          </Link>
        </div>
      </section>
    </div>
  );
}
