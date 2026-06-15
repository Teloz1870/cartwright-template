import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isStripeReady: vi.fn(),
  paymentMethodsRow: vi.fn(
    ({
      methods,
      className,
    }: {
      methods?: string[];
      className?: string;
    }) => (
      <span
        data-payment-methods={methods?.join(",")}
        className={className}
        aria-label="Accepterede betalingsmetoder"
      >
        Stripe Link
      </span>
    ),
  ),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeReady: mocks.isStripeReady,
}));

vi.mock("@/components/payments/PaymentMethodsRow", () => ({
  default: mocks.paymentMethodsRow,
}));

import TrustBadges from "@/components/TrustBadges";
import { brand } from "@/brand.config";

// F2 (P3-fix): primary-feature-badge label kommer fra brand.uiLabels —
// kan være "UV400" på solbrillen, "10 års garanti" på panel-hegn, etc.
const PRIMARY = brand.uiLabels.trustBadgesPrimary;

type TrustBadgesProps = Parameters<typeof TrustBadges>[0];

async function renderTrustBadges(props: TrustBadgesProps) {
  return renderToStaticMarkup(await TrustBadges(props));
}

describe("TrustBadges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.isStripeReady.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the variant-specific always-on badges", async () => {
    const homepage = await renderTrustBadges({ variant: "homepage" });
    expect(homepage).toContain("Free shipping");
    expect(homepage).toContain("30-day returns");
    expect(homepage).toContain(PRIMARY);
    expect(homepage).toContain("Secure payment");
    expect(homepage).not.toContain("GDPR");

    const product = await renderTrustBadges({ variant: "product" });
    expect(product).toContain("Free shipping");
    expect(product).toContain("30-day returns");
    expect(product).not.toContain(PRIMARY);
    expect(product).not.toContain("Secure payment");
    expect(product).not.toContain("GDPR");

    const checkout = await renderTrustBadges({ variant: "checkout" });
    expect(checkout).toContain("Free shipping");
    expect(checkout).toContain("30-day returns");
    expect(checkout).toContain("Secure payment");
    expect(checkout).not.toContain(PRIMARY);
    expect(checkout).not.toContain("GDPR");

    const footer = await renderTrustBadges({ variant: "footer" });
    expect(footer).toContain("Free shipping");
    expect(footer).toContain("30-day returns");
    expect(footer).toContain(PRIMARY);
    expect(footer).toContain("Secure payment");
    expect(footer).toContain("GDPR");
  });

  it("renders e-maerket badge only when NEXT_PUBLIC_EMAERKET is true", async () => {
    vi.stubEnv("NEXT_PUBLIC_EMAERKET", "true");
    await expect(renderTrustBadges({ variant: "homepage" })).resolves.toContain(
      "e-mark",
    );

    vi.stubEnv("NEXT_PUBLIC_EMAERKET", "false");
    await expect(renderTrustBadges({ variant: "homepage" })).resolves.not.toContain(
      "e-mark",
    );
  });

  it("defaults to 5 footer badges, not 6, when e-maerket env var is not set", async () => {
    const html = await renderTrustBadges({ variant: "footer" });

    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain("Secure payment");
    expect(html).not.toContain("e-mark");
  });

  it("links point to actual info paths", async () => {
    const html = await renderTrustBadges({ variant: "footer" });

    expect(html).toContain('href="/info/shipping"');
    expect(html).toContain('href="/info/returns"');
    expect(html).toContain('href="/info/faq"');
    expect(html).toContain('href="/info/privacy"');
  });

  it("Secure payment badge nests PaymentMethodsRow with stripe-link method", async () => {
    const html = await renderTrustBadges({ variant: "checkout" });

    expect(html).toContain("Secure payment");
    expect(html).toContain("Stripe Link");
    expect(html).toContain('data-payment-methods="stripe-link"');
    expect(html).not.toContain('aria-label="Visa"');
    expect(html).not.toContain('aria-label="Mastercard"');
    expect(mocks.paymentMethodsRow).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "small",
        methods: ["stripe-link"],
        className: "mt-1",
      }),
      undefined,
    );
  });
});
