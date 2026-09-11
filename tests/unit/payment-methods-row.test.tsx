import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isStripeReady: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeReady: mocks.isStripeReady,
}));

// Namespace-aware echo (house pattern, tests/unit/header-nav-locale.test.tsx):
// the rendered string carries the namespace, so a call site that reaches for
// the wrong one fails loudly instead of passing on a bare key. This row used to
// hardcode its Danish chrome; the assertions below now check that it RESOLVES
// the copy, which is the property that was actually broken.
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));

import PaymentMethodsRow from "@/components/payments/PaymentMethodsRow";

async function renderPaymentMethodsRow(
  props: Parameters<typeof PaymentMethodsRow>[0],
) {
  return renderToStaticMarkup(await PaymentMethodsRow(props));
}

describe("PaymentMethodsRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isStripeReady.mockResolvedValue(true);
  });

  it("renders all 6 default methods when Stripe is ready", async () => {
    const html = await renderPaymentMethodsRow({ size: "medium" });

    expect(html).toContain('aria-label="Visa"');
    expect(html).toContain('aria-label="Mastercard"');
    expect(html).toContain('aria-label="MobilePay"');
    expect(html).toContain('aria-label="Apple Pay"');
    expect(html).toContain('aria-label="Google Pay"');
    expect(html).toContain('aria-label="Stripe Link"');
    expect(html.match(/role="img"/g)).toHaveLength(6);
  });

  it("returns demo-mode banner content when Stripe is not ready", async () => {
    mocks.isStripeReady.mockResolvedValue(false);

    const html = await renderPaymentMethodsRow({ size: "medium" });

    expect(html).toContain("Demo-mode");
    expect(html).toContain("border-amber-300");
    expect(html).not.toContain('role="img"');
  });

  it("uses size prop to control logo height", async () => {
    await expect(renderPaymentMethodsRow({ size: "small" })).resolves.toContain(
      'class="h-6 w-10"',
    );
    await expect(renderPaymentMethodsRow({ size: "medium" })).resolves.toContain(
      'class="h-8 w-13"',
    );
    await expect(renderPaymentMethodsRow({ size: "large" })).resolves.toContain(
      'class="h-10 w-16"',
    );
  });

  it("uses methods prop to filter which logos are shown", async () => {
    const html = await renderPaymentMethodsRow({
      size: "medium",
      methods: ["visa", "mobilepay"],
    });

    expect(html).toContain('aria-label="Visa"');
    expect(html).toContain('aria-label="MobilePay"');
    expect(html).not.toContain('aria-label="Mastercard"');
    expect(html).not.toContain('aria-label="Apple Pay"');
    expect(html).not.toContain('aria-label="Google Pay"');
    expect(html).not.toContain('aria-label="Stripe Link"');
    expect(html.match(/role="img"/g)).toHaveLength(2);
  });

  it("resolves the secure-payment prefix through i18n, only when showPrefix is true", async () => {
    await expect(renderPaymentMethodsRow({ size: "medium" })).resolves.not.toContain(
      "TrustBadges.securePayment",
    );
    await expect(
      renderPaymentMethodsRow({ size: "medium", showPrefix: true }),
    ).resolves.toContain("TrustBadges.securePayment");
  });

  it("never ships the Danish chrome as a literal", async () => {
    // The regression this file exists to prevent: an English shop announcing
    // its payment row in Danish because the component hardcoded the strings
    // that messages/{da,en}.json already carried.
    const html = await renderPaymentMethodsRow({ size: "medium", showPrefix: true });
    expect(html).not.toContain("Sikker betaling");
    expect(html).not.toContain("Accepterede betalingsmetoder");
  });

  it("labels the logo row for screen readers through i18n", async () => {
    await expect(renderPaymentMethodsRow({ size: "medium" })).resolves.toContain(
      'aria-label="TrustBadges.paymentMethodsAria"',
    );
  });
});
