// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { LockedLookNotice } from "@/app/[locale]/mixer-preview/LockedLookNotice";

/**
 * LockedLookNotice — the DISMISS interaction. The page-wiring tests render via
 * renderToStaticMarkup (no client state), so "dismissible" must be pinned with
 * a real DOM + click: after clicking the Dismiss button the whole notice
 * unmounts (returns null), not just hides.
 */
declare global {
  // React's act() requires this opt-in outside a test renderer.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("LockedLookNotice dismissal", () => {
  it("clicking Dismiss removes the notice from the DOM", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<LockedLookNotice designName="SaaS Dark (futurist / cyber)" />);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.textContent).toContain("SaaS Dark (futurist / cyber)");

      const btn = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss notice"]',
      );
      expect(btn).not.toBeNull();
      await act(async () => {
        btn!.click();
      });

      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent).not.toContain("keeps its own locked look");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
