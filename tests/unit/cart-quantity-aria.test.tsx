import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { CartQuantity } from "@/components/CartQuantity";
import messages from "@/messages/en.json";

/**
 * CartQuantity renders outside the AnnouncementProvider here — useAnnounce()
 * is a defensive no-op without a provider, so the island renders standalone.
 * The labels are localized via next-intl `t()`, so it IS wrapped in a
 * NextIntlClientProvider (English messages) — the assertions below lock the
 * a11y contract to the rendered English labels for the `en` locale.
 *
 * Two contracts: (1) the "Remove" button gains a line-specific accessible name
 * when itemName is passed, and (2) the −/+ steppers name the line they act on.
 * With itemName omitted, the Remove button emits no aria-label and the steppers
 * fall back to their context-free (still translated) labels.
 */
function renderCart(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CartQuantity remove-button accessible name", () => {
  it("with itemName: the Remove button announces the product", () => {
    const html = renderCart(
      <CartQuantity
        cartItemId="ci_1"
        quantity={2}
        max={9}
        itemName="Aviator Sunglasses"
      />,
    );
    expect(html).toContain('aria-label="Remove Aviator Sunglasses from cart"');
  });

  it("without itemName: no aria-label is emitted (byte-identical legacy render)", () => {
    const html = renderCart(
      <CartQuantity cartItemId="ci_1" quantity={2} max={9} />,
    );
    expect(html).not.toContain("Remove from cart");
    // The Remove button still renders, just without an aria-label override.
    expect(html).toContain(">Remove<");
    expect(html).not.toMatch(/aria-label="Remove[^"]*"/);
  });

  it("escapes a product name with markup-significant characters", () => {
    const html = renderCart(
      <CartQuantity
        cartItemId="ci_1"
        quantity={1}
        max={3}
        itemName={'Ray "Classic" & Co'}
      />,
    );
    // React escapes " & in attribute values — no raw injection.
    expect(html).toContain(
      'aria-label="Remove Ray &quot;Classic&quot; &amp; Co from cart"',
    );
  });
});

describe("CartQuantity stepper accessible names", () => {
  it("with itemName: the −/+ steppers name the line they act on", () => {
    const html = renderCart(
      <CartQuantity cartItemId="ci_1" quantity={2} max={9} itemName="Mug" />,
    );
    expect(html).toContain('aria-label="Decrease quantity of Mug"');
    expect(html).toContain('aria-label="Increase quantity of Mug"');
  });

  it("without itemName: the steppers keep their context-free labels", () => {
    const html = renderCart(
      <CartQuantity cartItemId="ci_1" quantity={2} max={9} />,
    );
    expect(html).toContain('aria-label="Decrease quantity"');
    expect(html).toContain('aria-label="Increase quantity"');
    // No " of " contextual suffix leaks in when the prop is omitted.
    expect(html).not.toContain("quantity of");
  });

  it("escapes a markup-significant product name in the stepper labels too", () => {
    const html = renderCart(
      <CartQuantity
        cartItemId="ci_1"
        quantity={1}
        max={3}
        itemName={'Ray "Classic" & Co'}
      />,
    );
    expect(html).toContain(
      'aria-label="Decrease quantity of Ray &quot;Classic&quot; &amp; Co"',
    );
    expect(html).toContain(
      'aria-label="Increase quantity of Ray &quot;Classic&quot; &amp; Co"',
    );
  });
});
