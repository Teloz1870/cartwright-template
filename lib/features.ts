/**
 * Phase B4/B5 — runtime feature detection for modern browser APIs.
 *
 * Each helper is SSR-safe: returns `false` when called outside a browser
 * environment so a server render never invents a non-existent capability.
 * Call from `"use client"` components or inside effects.
 *
 * These complement (do not replace) the compile-time `brand.features.*`
 * flags. The pattern is: only use a modern primitive when *both* the
 * brand flag is on *and* the browser actually supports it.
 *
 *   const useNative = brand.features.popoverApi && supportsDialog();
 *
 * Conservative gating: better to ship the React-state fallback than to
 * break in a browser we didn't anticipate.
 */

/** Native `<dialog>` element with showModal(). Baseline 2022. */
export function supportsDialog(): boolean {
  if (typeof HTMLDialogElement === "undefined") return false;
  return typeof HTMLDialogElement.prototype.showModal === "function";
}

/**
 * Popover API (`popover` attribute + showPopover/hidePopover).
 * Baseline 2024. Older Firefox/Safari may lack support.
 */
export function supportsPopover(): boolean {
  if (typeof HTMLElement === "undefined") return false;
  return "popover" in HTMLElement.prototype;
}

/**
 * View Transitions API (`document.startViewTransition`). Chrome 111+,
 * Edge 111+, Safari 18+. Firefox no support yet (2026-05). Used by
 * Phase B5 navigation wrappers — callers must handle the "not
 * supported" branch by running the navigation directly.
 */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === "function"
  );
}
