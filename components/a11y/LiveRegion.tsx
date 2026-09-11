"use client";

import { useAnnouncementState } from "@/lib/a11y/announcement-context";

/**
 * Phase B1 — screen-reader announcement surface.
 *
 * Renders two `aria-live` regions (polite + assertive) that consume the
 * shared AnnouncementProvider state. Mount once near the end of
 * `app/[locale]/layout.tsx` (after the rest of the storefront) so the
 * regions exist in the DOM at all times — some assistive technologies
 * only watch live regions that were present at page load.
 *
 * The `key` prop on each region's child div forces React to remount the
 * node when a new announcement fires. Remounts cause screen readers to
 * re-announce, which is what we want even if the message text is
 * unchanged from the previous announcement (e.g. user adds the same item
 * twice in a row).
 *
 * Visually hidden via `sr-only` — Tailwind v4 ships this utility by
 * default. The regions never paint on screen.
 */
export function LiveRegion() {
  const { polite, assertive } = useAnnouncementState();

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        <div key={polite?.id ?? "polite-empty"}>{polite?.message ?? ""}</div>
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        <div key={assertive?.id ?? "assertive-empty"}>
          {assertive?.message ?? ""}
        </div>
      </div>
    </>
  );
}
