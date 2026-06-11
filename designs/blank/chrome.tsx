/**
 * Blank Canvas — site-wide chrome (Header + Footer).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  YOURS TO REWRITE — TOTAL FREEDOM                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * These two components ARE your site's header and footer on every page —
 * homepage, contact, info pages, and (in webshop mode) PLP/PDP/cart/checkout.
 * They are wired through `DesignPack.siteChrome` in designs/blank/index.ts,
 * which means app/[locale]/layout.tsx renders THEM instead of the shared
 * engine chrome whenever the `blank` design is active.
 *
 * Delete everything below and build your own. The only contract:
 *
 *   - Export two React components taking `DesignChromeProps` = `{ locale }`.
 *   - They render server-side (no "use client" needed unless you add
 *     interactivity — then split the interactive bit into its own client file).
 *   - Prefix internal links with `/${locale}` (e.g. `/${locale}/contact`),
 *     because every storefront route is locale-scoped.
 *
 * Everything else is up to you:
 *   - Styling: Tailwind utilities, your own CSS file (create blank.css here
 *     and `import "./blank.css"`), inline styles — anything. The engine's
 *     cw-* and sol-* design tokens are OPTIONAL here; the markup below is
 *     deliberately token-free so you start from a true blank.
 *   - Fonts: load any Google font with `next/font/google` at module scope
 *     (see designs/fable/chrome.tsx for a worked example with Fraunces).
 *   - Nav: hardcode links, or fetch pages/categories from the DB like the
 *     shared chrome does (see components/Header.tsx — it's a server
 *     component, `await prisma.page.findMany(...)` works right here).
 *
 * Useful data you can reach from a server component:
 *   - `brand` (brand.config.ts) — storeName, contact, footer copy, locales.
 *   - `prisma` (lib/db) — pages, categories, anything in the DB.
 *
 * Keep it accessible: a <header> with <nav aria-label>, a <footer>, real
 * links. Screen readers and SEO get those for free when the markup stays
 * semantic.
 */
import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignChromeProps } from "../types";

export function BlankHeader({ locale }: DesignChromeProps) {
  const home = `/${locale}`;
  return (
    // Intentionally bare: a name and two links in the system font stack.
    // This is scaffolding, not a design — replace it with yours.
    <header style={{ borderBottom: "1px solid #e5e5e5" }}>
      <nav
        aria-label="Primary"
        style={{
          margin: "0 auto",
          maxWidth: "72rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <Link href={home} style={{ fontWeight: 600, color: "#171717", textDecoration: "none" }}>
          {brand.storeName}
        </Link>
        <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.875rem" }}>
          <Link href={home} style={{ color: "#525252", textDecoration: "none" }}>
            Home
          </Link>
          <Link href={`${home}/contact`} style={{ color: "#525252", textDecoration: "none" }}>
            Contact
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function BlankFooter({ locale }: DesignChromeProps) {
  void locale; // prefix your links with `/${locale}` when you add some
  const year = new Date().getFullYear();
  return (
    // Same deal as the header: one quiet line, zero opinions. Rewrite freely.
    <footer style={{ borderTop: "1px solid #e5e5e5", marginTop: "4rem" }}>
      <div
        style={{
          margin: "0 auto",
          maxWidth: "72rem",
          padding: "1.5rem 1.25rem",
          fontSize: "0.75rem",
          color: "#737373",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        © {year} {brand.storeName}
      </div>
    </footer>
  );
}
