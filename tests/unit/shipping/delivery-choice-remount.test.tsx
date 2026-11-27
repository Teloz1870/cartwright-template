// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { DeliveryChoiceProvider } = await import("@/components/checkout/DeliveryChoice");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The checkout form sits inside DeliveryChoiceProvider. A refresh after a
 * refused order (SHIPPING_CHOICE, PRODUCT_UNAVAILABLE) can move the delivery
 * options across two; the form must not remount then, or the customer loses
 * what they typed and the message that says why.
 */
describe("DeliveryChoiceProvider keeps the checkout form mounted", () => {
  it("when the options go from two to one and back", () => {
    let mounts = 0;
    function Form() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>form</p>;
    }
    const a = { id: "a", name: "A", days: null, feeLabel: "39", totalLabel: "289" };
    const b = { id: "b", name: "B", days: null, feeLabel: "99", totalLabel: "349" };
    const host = document.createElement("div");
    const root = createRoot(host);
    const render = (options: (typeof a)[]) =>
      act(() => {
        root.render(
          <DeliveryChoiceProvider options={options}>
            <Form />
          </DeliveryChoiceProvider>,
        );
      });
    render([a, b]);
    render([a]);
    render([]);
    render([a, b]);
    expect(mounts).toBe(1);
    act(() => root.unmount());
  });
});
