import { brand } from "@/brand.config";

/**
 * The identity columns every `BrandingSettings` create-branch must use.
 *
 * `prisma.brandingSettings.upsert({ where: { id: 1 }, … })` runs its `create:`
 * branch only when no row exists yet — which is the normal state of a fork that
 * configures itself in code and never opens the setup wizard. On such a site the
 * FIRST arbitrary admin action (toggling a feature flag, picking a design,
 * saving SEO settings…) is what materialises the row, so whatever that branch
 * hardcodes becomes the site's stored identity.
 *
 * Nineteen call sites across fourteen files used to hardcode `storeName:
 * "Cartwright"` (and `"My store"` / `"Min shop"` in the wizard's own writers).
 * The result: a downstream fork toggled the blog flag in `/admin/features` and
 * its live site renamed itself to "Cartwright" — header, footer, and `llms.txt`,
 * the file AI crawlers read. No error, no log line.
 *
 * The row's job is to hold what the admin may change (cosmetics: logo, palette,
 * design, announcement). It must never *invent* identity. `brand.config.ts` is
 * the single source of truth for who the site is; when the row is silent, the
 * config answers.
 *
 * Deliberately NOT `server-only`: seeds, scripts and plugins create this row too.
 *
 * Enforced by `tests/unit/branding-create-defaults.test.ts`, which fails the
 * build if any writer reintroduces a literal store name.
 */
export function brandingCreateDefaults() {
  return {
    id: 1 as const,
    storeName: brand.storeName as string,
    // Without this the Prisma column default ("da") stamps the engine's locale
    // onto every row a code-configured fork creates — the same class of bug as
    // the store name, one axis over.
    defaultLocale: brand.defaultLocale as string,
    heroImage: "",
    announcement: "",
  };
}
