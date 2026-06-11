/**
 * Blank Canvas — homepage.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THIS CANVAS IS INTENTIONALLY BLANK. BUILD ANYTHING.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * This file is the entire homepage when the `blank` design is active. It is
 * a React Server Component (no "use client") — delete the placeholder markup
 * at the bottom and build a completely unique page. The rest of this comment
 * is the build-anything guide.
 *
 * ── What you receive (DesignHomepageProps, designs/types.ts) ───────────────
 *
 *   settings   BrandingSettings | null — the admin's DB overrides. The copy
 *              chain convention (see designs/aurora-site/homepage.tsx):
 *                const headline =
 *                  settings?.websiteHeadline || genome?.hero.headline || brand.website.headline;
 *              i.e. admin override ?? Voice/genome copy ?? brand.config anchor.
 *              You may also ignore all of it and hardcode your own copy.
 *   locale     "da" | "en" | … — prefix EVERY internal link with `/${locale}`.
 *   featured   DesignProduct[] (webshop mode) — featured products incl. a
 *              computed `imageUrl`. Link each to `/${locale}/produkter/${slug}`.
 *   categories Category[] (webshop mode) — link to `/${locale}/kategori/${slug}`.
 *   threeD     resolved Live Canvas config — when `threeD?.enabled`, you can
 *              render `<ThreeHero scene={threeD.scene} intensity={threeD.intensity} />`
 *              (components/ThreeHero.tsx) behind your hero. Optional.
 *   genome     Voice/genome-resolved copy (only when brand.features.genomeResolve
 *              is on) — see HomeGenomeCopy in designs/types.ts.
 *   editEnabled  in-place admin copy editing — safe to ignore on a bespoke page.
 *
 * ── Adding sections / files ────────────────────────────────────────────────
 *
 *   Put extra components in this folder (designs/blank/sections/*.tsx) and
 *   import them here. Server components by default; add "use client" only to
 *   leaf components that need state/effects. A CSS file works too: create
 *   designs/blank/blank.css and `import "./blank.css"` at the top of this
 *   file — scope your rules under one root class to keep them out of the
 *   admin and other routes.
 *
 * ── Styling: tokens are OPTIONAL here ──────────────────────────────────────
 *
 *   The engine's palette tokens (--color-sol-*, --color-cw-*) exist on every
 *   page, and because this pack sets `applyPaletteAsTheme: true` with a
 *   neutral grayscale palette, all the BUILT-IN surfaces (cart, checkout,
 *   account, admin-adjacent pages) render in clean monochrome until you (or
 *   the shop's themeJson palette) say otherwise. Your own markup does NOT
 *   have to use them — plain CSS/Tailwind colors are fine. If you want the
 *   shop's palette to flow into your design, read the tokens
 *   (e.g. `text-[var(--color-sol-accent)]` or `bg-cw-paper`).
 *
 * ── How your design reaches every page ─────────────────────────────────────
 *
 *   designs/blank/index.ts registers `siteChrome: { Header, Footer }`
 *   (designs/blank/chrome.tsx) — those render on EVERY storefront page. For
 *   per-page-type templates, add to the pack registration:
 *     pages:   { contact, info, notFound }          — own those pages' bodies
 *     webshop: { productCard, pdpLayout, categoryLayout } — own the shop look
 *   Contracts in designs/types.ts (DesignPages / WebshopOverrides).
 *
 * ── What keeps working for free ────────────────────────────────────────────
 *
 *   Database + Prisma, cart + checkout + Stripe, auth + account, the whole
 *   /admin, the AI tool surface (/api/v1/tools), JSON-LD structured data,
 *   sitemap/robots/llms.txt, i18n routing. You are ONLY painting the front.
 *
 * ── Two reminders ──────────────────────────────────────────────────────────
 *
 *   - Reduced motion: wrap any animation in
 *     `@media (prefers-reduced-motion: no-preference)` (CSS) or a
 *     `matchMedia` guard (JS). Content must be visible without motion.
 *   - A11y: one <h1> per page, semantic landmarks, alt text on images,
 *     visible :focus-visible outlines. Bare ≠ inaccessible.
 */
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";

export default function BlankHomepage({ settings }: DesignHomepageProps) {
  // Placeholder page — storeName + one muted line. Replace everything in
  // this return (and the props you destructure) with your own design.
  const storeName = settings?.storeName || brand.storeName;
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "72rem",
        padding: "6rem 1.25rem",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 600, color: "#171717" }}>{storeName}</h1>
      <p style={{ marginTop: "0.75rem", color: "#737373" }}>
        This canvas is intentionally blank. Build anything.
      </p>
    </main>
  );
}
