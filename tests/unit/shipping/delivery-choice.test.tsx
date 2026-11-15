import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import {
  DeliveryChoiceProvider,
  DeliveryOptions,
  SummaryShipping,
  SummaryShippingName,
  SummaryTotal,
  type DeliveryOption,
} from "@/components/checkout/DeliveryChoice";

/** Checkout's delivery step (SHIP0-b): components/checkout/DeliveryChoice.tsx. */
const GLS: DeliveryOption = { id: "gls", name: "GLS", days: "1–2 days", feeLabel: "39 kr", totalLabel: "289 kr" };
const EXPRESS: DeliveryOption = { id: "express", name: "Express", days: null, feeLabel: "99 kr", totalLabel: "349 kr" };

const step = (options: DeliveryOption[], disabled = false) =>
  renderToStaticMarkup(
    <DeliveryChoiceProvider options={options}>
      <DeliveryOptions disabled={disabled} />
      <p>
        <SummaryShippingName fallback="Flat" />|<SummaryShipping fallback="49 kr" />|<SummaryTotal fallback="299 kr" />
      </p>
    </DeliveryChoiceProvider>,
  );

describe("DeliveryChoice", () => {
  it("with two or more options: lists them, the cheapest (first) chosen, and the summary shows that one", () => {
    const html = step([GLS, EXPRESS]);
    expect(html).toContain("deliveryMethod");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="gls"/);
    expect(html).toContain(" (GLS)|39 kr|289 kr");
  });

  it("with one option or none: no step, and the summary keeps what the server rendered", () => {
    for (const options of [[GLS], []]) {
      const html = step(options);
      expect(html).not.toContain("radio");
      expect(html).toContain(" (Flat)|49 kr|299 kr");
    }
  });

  it("is locked while the order is placed, so the summary cannot drift from what is charged", () => {
    expect(step([GLS, EXPRESS], true)).toMatch(/<fieldset[^>]*disabled/);
    expect(step([GLS, EXPRESS], false)).not.toMatch(/<fieldset[^>]*disabled/);
  });
});
