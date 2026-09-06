import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { cremaDesign } from "@/designs/crema";
import { CremaPlpFrame } from "@/designs/crema/webshop/PlpFrame";
import en from "@/messages/en.json";
import da from "@/messages/da.json";

/**
 * The PLP was the demo's second click and the last surface that still read
 * "template": a stock-photo hero band over a light page inside a dark shop.
 * The crema frame replaces it (webshop.plpLayout, designSurfaces-gated) with
 * the editorial shelf head. The engine-side handover contract is pinned in
 * the produkter page itself; here we pin the pack side.
 */
function render(locale: "en" | "da", count: number): string {
  const messages = locale === "en" ? en : da;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CremaPlpFrame heading="All products" productCount={count} locale={locale}>
        <div data-testid="plp-children" />
      </CremaPlpFrame>
    </NextIntlClientProvider>,
  );
}

describe("crema PLP frame", () => {
  it("is registered as the pack's plpLayout", () => {
    expect(cremaDesign.webshop?.plpLayout).toBe(CremaPlpFrame);
  });

  it("renders the editorial shelf head — not the config-English uiLabels heading", () => {
    const html = render("en", 12);
    expect(html).toContain("crema-plp-head");
    expect(html).toContain("The <em>shelf</em>");
    expect(html).toContain("12 items on the shelf");
    // i18n-from-birth: the single-language config heading is deliberately
    // NOT rendered (the prop exists for engine-parity packs).
    expect(html).not.toContain("All products");
    // The engine's children (breadcrumb + filters + grid) render below.
    expect(html).toContain('data-testid="plp-children"');
  });

  it("localizes the head for /da and pluralizes the ledger line", () => {
    const daHtml = render("da", 1);
    expect(daHtml).toContain("<em>Hylden</em>");
    expect(daHtml).toContain("1 vare på hylden");
    const daMany = render("da", 8);
    expect(daMany).toContain("8 varer på hylden");
  });

  it("keeps exactly one h1 and stagger-reveals the head (reduced-motion safe by CSS default)", () => {
    const html = render("en", 3);
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
    expect(html.match(/data-crema-stagger/g)?.length).toBe(3);
  });
});
