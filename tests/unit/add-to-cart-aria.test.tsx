import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { AddToCartButton } from "@/components/AddToCartButton";
import messages from "@/messages/en.json";

/**
 * AddToCartButton renders outside the AnnouncementProvider here — useAnnounce()
 * is a defensive no-op without a provider, so the island renders standalone.
 * Its labels are localized via next-intl `t()`, so it IS wrapped in a
 * NextIntlClientProvider (English messages) — the assertions below lock the
 * a11y contract to the rendered English labels for the `en` locale.
 *
 * Locks the a11y contract on the button: its visible label ("Add to cart")
 * carries no product context, so screen readers can't tell WHICH product is
 * being added when several buttons share the page/markup. An optional
 * productName gives it a state-aware accessible name; when omitted no aria-label
 * attribute is emitted.
 *
 * renderToStaticMarkup renders the initial state → isPending=false, added=false
 * → the "Add" branch of the label.
 */
function renderButton(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AddToCartButton accessible name", () => {
  it("with productName: the button announces the product (Add state)", () => {
    const html = renderButton(
      <AddToCartButton productId="p_1" productName="Aviator Sunglasses" />,
    );
    expect(html).toContain('aria-label="Add Aviator Sunglasses to cart"');
    // Visible label is unchanged.
    expect(html).toContain(">Add to cart<");
  });

  it("without productName: no aria-label is emitted (byte-identical legacy render)", () => {
    const html = renderButton(<AddToCartButton productId="p_1" />);
    expect(html).not.toMatch(/aria-label=/);
    // The button still renders its visible label.
    expect(html).toContain(">Add to cart<");
  });

  it("escapes a product name with markup-significant characters", () => {
    const html = renderButton(
      <AddToCartButton productId="p_1" productName={'Ray "Classic" & Co'} />,
    );
    // React escapes " & in attribute values — no raw injection.
    expect(html).toContain(
      'aria-label="Add Ray &quot;Classic&quot; &amp; Co to cart"',
    );
  });

  it("empty productName falls back to no aria-label (truthiness gate)", () => {
    const html = renderButton(
      <AddToCartButton productId="p_1" productName="" />,
    );
    expect(html).not.toMatch(/aria-label=/);
  });
});
