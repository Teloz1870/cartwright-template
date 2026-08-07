import "server-only";

/**
 * B1 static seam variant — chrome + homepage content WITHOUT a database
 * (site-profile program).
 *
 * Every function returns the exact empty shape its call sites already handle
 * today when the DB is unreachable (the fail-soft branches in Header, Footer
 * and the homepage): no categories, no nav pages, no info pages, no custom
 * home page. In the `site` profile, navigation comes from the design pack /
 * brand.config — not from these sources.
 *
 * NOTHING in the engine imports this file today — it exists so the B3
 * materializer can wire the no-DB `site` profile's seam
 * (`lib/data-source/nav.ts`) to it. The engine stays byte-identical until a
 * materializer performs that swap.
 */

// Return types are STRUCTURAL subsets of the db variant's Prisma shapes,
// covering exactly the fields today's call sites consume (codex review
// fold-in, PR #382): a B3 materialization that copies this file over the
// seam target must keep those call sites compiling — `never[]`/`null`
// literals would not.

/** Header + Footer: no DB → no shop categories. */
export async function fetchNavCategories(): Promise<
  Array<{ id: string; slug: string; name: string }>
> {
  return [];
}

/** Header (website mode): no DB → nav comes from the design/config, not Pages. */
export async function fetchNavPages(): Promise<Array<{ slug: string; title: string }>> {
  return [];
}

/** Footer: no seeded info pages → the about/faq links are hidden. */
export async function fetchInfoPages(): Promise<Array<{ slug: string }>> {
  return [];
}

/**
 * Homepage: no DB → no category teaser row.
 *
 * DELIBERATE subset: today's app/[locale]/page.tsx forwards these categories
 * as full Prisma `Category[]` into `DesignHomepageProps.categories`
 * (designs/types.ts) — a contract no no-DB source can satisfy. This seam is
 * therefore necessary but NOT sufficient for page.tsx: the site profile
 * replaces page.tsx itself with a B3 static homepage variant (see
 * core.knownDeviations in modules/registry.ts), and THAT variant consumes
 * this subset.
 */
export async function fetchHomeCategories(): Promise<
  Array<{ id: string; slug: string; name: string; translations: unknown }>
> {
  return [];
}

/** Homepage: no DB → never a custom "home" page; the design homepage renders. */
export async function fetchHomePage(): Promise<{
  vibeHtml: string | null;
  translations: unknown;
} | null> {
  return null;
}
