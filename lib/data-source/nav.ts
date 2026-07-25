import "server-only";

import { prisma } from "@/lib/db";

/**
 * B1 data-source seam — chrome + homepage content sources (site-profile
 * program, `internal-docs/site-profile-ultraplan.md` §5).
 *
 * This file is the seam target `lib/data-source/nav.ts` declared by the core
 * module (modules/registry.ts) and provided by the db module: every
 * prisma.category / prisma.page read the core render path (Header, Footer,
 * homepage) performs lives here — one function per data source, extracted
 * VERBATIM from components/Header.tsx / components/Footer.tsx /
 * app/[locale]/page.tsx (pure extract-method, queries unchanged).
 *
 * The fail-soft `.catch()`es deliberately STAY at the call sites so the
 * per-component log prefixes ("[Header] …", "[Footer] …", "[home] …") and
 * degraded-render behavior are unchanged. The static variant (nav.static.ts)
 * returns the empty shapes those same call sites already handle — the B3
 * materializer wires no-DB profiles to it.
 */

/** Header + Footer: the full category list for shop navigation. */
export function fetchNavCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

/** Header (website mode): pages marked for navigation. */
export function fetchNavPages() {
  return prisma.page.findMany({
    where: { showInNav: true, status: "published" },
    orderBy: { navOrder: "asc" },
    select: { slug: true, title: true },
  });
}

/**
 * Footer: which of the about/om-os/faq info pages the active template
 * actually seeded — the footer links to what exists instead of 404'ing.
 */
export function fetchInfoPages() {
  return prisma.page.findMany({
    where: { slug: { in: ["about", "om-os", "faq"] }, status: "published" },
    select: { slug: true },
  });
}

/** Homepage: the 3-category teaser row. */
export function fetchHomeCategories() {
  return prisma.category.findMany({ take: 3 });
}

/**
 * Homepage: the custom "home" page. A draft "home" page is treated as no
 * custom home → the design/first-run homepage renders, so unreviewed
 * imported copy never shows publicly.
 */
export function fetchHomePage() {
  return prisma.page
    .findUnique({ where: { slug: "home" } })
    .then((p) => (p && p.status === "published" ? p : null));
}
