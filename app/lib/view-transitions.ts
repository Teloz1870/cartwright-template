/**
 * Phase B5 — View Transitions API wrapper.
 *
 * Cartwright's storefront uses Next.js App Router SPA navigation for the
 * shop and MPA navigation for content pages. View Transitions smooth the
 * SPA case (PLP → PDP, cart → checkout) by capturing the old and new DOM
 * states and morphing between them. Elements that share a
 * `view-transition-name: <id>` morph in place.
 *
 * Browser support (2026-05): Chrome 111+, Edge 111+, Safari 18+. Firefox
 * lacks support. Callers must therefore degrade to direct navigation —
 * `wrapNavigation` handles this automatically.
 *
 * Pairing with `brand.features.viewTransitions`: that flag is the
 * compile-time on/off; runtime detection via `supportsViewTransitions`
 * (lib/features.ts) is the browser-availability check. We only call
 * `startViewTransition` when *both* are true.
 */
import { brand } from "@/brand.config";
import { supportsViewTransitions } from "@/lib/features";

type StartViewTransition = (
  callback: () => void | Promise<void>,
) => { finished: Promise<void> } | undefined;

function getStarter(): StartViewTransition | null {
  if (!supportsViewTransitions()) return null;
  // Loosened type — the global lib types may not yet expose
  // startViewTransition on `document`.
  const doc = document as Document & {
    startViewTransition?: StartViewTransition;
  };
  return typeof doc.startViewTransition === "function"
    ? doc.startViewTransition.bind(doc)
    : null;
}

/**
 * Run `navigate` inside a view transition when the feature flag is on AND
 * the browser supports it. Otherwise just run it directly.
 *
 * Use for client-side router pushes:
 *
 *   wrapNavigation(() => router.push(href));
 *
 * Caller's responsibility: keep the navigation synchronous-looking inside
 * the callback. View Transitions captures DOM state at the end of the
 * microtask, so async work after `router.push` returns will be picked up.
 */
export function wrapNavigation(
  navigate: () => void | Promise<void>,
  /**
   * Resolved `viewTransitions`-flag fra kald-stedet (useFeature). Default
   * falder tilbage til brand.config så ikke-context-callere fortsat virker.
   * getStarter() laver stadig browser-support-checket.
   */
  enabled: boolean = brand.features.viewTransitions,
): void {
  const start = enabled ? getStarter() : null;
  if (!start) {
    void navigate();
    return;
  }
  start(() => {
    void navigate();
  });
}

/**
 * Compute the `view-transition-name` for a product hero image. Shared
 * between the PLP card thumbnail and the PDP main image so the browser
 * morphs them across the navigation. Must be unique on each page; the
 * product id guarantees that.
 */
export function productHeroTransitionName(productId: string): string {
  return `hero-${productId}`;
}
