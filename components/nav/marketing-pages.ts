/**
 * The website-mode marketing pages the site header links to — ONE list, read
 * by both halves of the same navigation.
 *
 * Why this exists: `HeaderClient` (desktop) and `MobileMenu` (drawer) each
 * carried their own copy, and the copies drifted. The Aurora rollout
 * redefined `HeaderClient`'s `isSaas` as "the active design asks for dark
 * chrome" (`darkChrome ?? <old heuristic>`); the drawer kept the old
 * heuristic. On a light-chrome website-mode shop — the engine default and the
 * website-mode canary — the desktop nav therefore rendered NONE of these
 * while the drawer rendered all of them, on the same page.
 *
 * The desktop copy had also kept a `/onboarding` entry that no route in this
 * engine serves; it was invisible only because the chrome gate happened to be
 * false.
 *
 * **Soundness, not completeness.** Rendering this list is gated on
 * `!ecommerceEnabled && industryTemplate === "saas"` — a webshop's nav is its
 * categories. `app/[locale]/{services,cases,priser}/page.tsx` call
 * `notFound()` on exactly that negation, so in THIS engine's file set every
 * link here resolves wherever it renders. A profile that prunes those route
 * directories (`--profile light` does) breaks that arithmetic if the owner
 * then sets `industryTemplate: "saas"` by hand; the guard for that case is
 * the route assertion in the test below, not this list. `/cartwright` is deliberately WEAKER on the route side (it
 * gates on `!ecommerceEnabled` alone), so it is served on non-saas websites
 * where this nav does not link it. That asymmetry is intentional and pinned
 * by `tests/unit/header-nav-parity.test.tsx`: the nav must never link a page
 * that 404s, but it is not obliged to link every page that answers.
 *
 * That predicate is CONTENT, not paint: it must never be confused with the
 * chrome hint again.
 */
type TranslatedPage = { href: string; key: string; label?: never };
type LiteralPage = { href: string; key?: never; label: string };

/** A link is either translated through the `Header` namespace or a proper noun — never neither. */
export type MarketingPage = TranslatedPage | LiteralPage;

export const MARKETING_PAGES: readonly MarketingPage[] = [
  { href: "/services", key: "services" },
  { href: "/cases", key: "cases" },
  { href: "/priser", key: "pricing" },
  { href: "/cartwright", label: "Cartwright" },
];
