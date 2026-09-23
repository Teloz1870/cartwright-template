import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WishlistButton } from "@/plugins/wishlist/components/WishlistButton";

/**
 * WishlistButton renders on every PLP card and the PDP. Its accessible name
 * (aria-label) was hardcoded Danish, so screen-reader users on English-first
 * shops heard Danish. An optional `locale` prop (default "da") gives English
 * shops an English accessible name. The default is byte-identical Danish, so
 * the Danish webshop canaries (Solbrillen/Northbound) are unaffected.
 *
 * useEffect does not run under renderToStaticMarkup, so `on` stays false and
 * the "add" variant of the label is what renders here.
 */
describe("WishlistButton locale-aware accessible name", () => {
  it("defaults to Danish (byte-identical legacy aria-label)", () => {
    const html = renderToStaticMarkup(<WishlistButton productId="p_1" />);
    expect(html).toContain('aria-label="Føj til ønskeliste"');
    // No English leaks in when the prop is omitted.
    expect(html).not.toContain("Add to wishlist");
  });

  it('locale="da" is identical to the default', () => {
    const def = renderToStaticMarkup(<WishlistButton productId="p_1" />);
    const da = renderToStaticMarkup(
      <WishlistButton productId="p_1" locale="da" />,
    );
    expect(da).toBe(def);
  });

  it('locale="en" announces the wishlist action in English', () => {
    const html = renderToStaticMarkup(
      <WishlistButton productId="p_1" locale="en" />,
    );
    expect(html).toContain('aria-label="Add to wishlist"');
    expect(html).not.toContain("ønskeliste");
  });

  it("preserves the aria-pressed state contract", () => {
    const html = renderToStaticMarkup(
      <WishlistButton productId="p_1" locale="en" />,
    );
    // Initial (un-hydrated) state: not yet on the list.
    expect(html).toContain('aria-pressed="false"');
  });
});
