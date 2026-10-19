// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * The mount's variant-label derivation is the seam where DB rows become the
 * agent's natural-language enum values. Chrome's best-practices doc uses the
 * literal example `variant: "Whole beans, 250 g"` — so the label must be the
 * attribute VALUES a human would recognise, never the sku or key plumbing.
 * (Duplicate labels are disambiguated by price in PdpWebMcpTools.)
 */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(async () => ({
    ecommerceEnabled: true,
    features: { webMcp: true },
  })),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/format", () => ({
  formatPrice: (oere: number) => `${(oere / 100).toFixed(2)} kr.`,
}));

const { default: PdpWebMcpMount } = await import("@/components/webmcp/PdpWebMcpMount");

const baseProduct = {
  id: "p1",
  name: "Colombia Supremo",
  slug: "colombia-supremo",
  priceDkk: 12900,
  stock: 0,
};

describe("PdpWebMcpMount — variant labels are natural language", () => {
  it("joins the attribute VALUES (no keys, no sku) into the option name", async () => {
    const element = (await PdpWebMcpMount({
      locale: "da",
      product: {
        ...baseProduct,
        variants: [
          {
            id: "v1",
            sku: "whole-250",
            priceDkk: 12900,
            stock: 18,
            attributes: { "Grind & size": "Whole beans, 250 g" },
          },
          {
            id: "v2",
            sku: "filter-250",
            priceDkk: 12900,
            stock: 12,
            attributes: { form: "Ground for filter", size: "250 g" },
          },
        ],
      },
    })) as ReactElement<{ product: { variants: { label: string }[] } }>;

    const labels = element.props.product.variants.map((v) => v.label);
    expect(labels).toEqual(["Whole beans, 250 g", "Ground for filter, 250 g"]);
    for (const label of labels) {
      expect(label).not.toMatch(/sku|whole-250|filter-250|Grind & size:/);
    }
  });

  it("falls back to the sku only when a variant carries no attributes", async () => {
    const element = (await PdpWebMcpMount({
      locale: "da",
      product: {
        ...baseProduct,
        variants: [
          { id: "v1", sku: "legacy-sku", priceDkk: 9900, stock: 2, attributes: {} },
        ],
      },
    })) as ReactElement<{ product: { variants: { label: string }[] } }>;

    expect(element.props.product.variants[0].label).toBe("legacy-sku");
  });
});

/**
 * The specs WIRING, not the formatter.
 *
 * `flattenPrimitiveAttributes` is unit-tested on its own, and the PDP tool test
 * hand-feeds `specs:` straight to the leaf — so two independent falsifiers found
 * that deleting this mount's `specs:` line, or the line in the PDP page that
 * hands it `attributes`, left the whole suite green. This renders the REAL
 * mount and asserts what reaches the tool component.
 */
async function mountWith(over: { attributes: Record<string, unknown> | null }) {
  return (await PdpWebMcpMount({
    locale: "da",
    product: { ...baseProduct, variants: [], ...over },
  })) as ReactElement<{ product: { specs?: Record<string, string> } }>;
}

describe("PdpWebMcpMount — the product's specifications reach the tool", () => {
  it("forwards the flattened attributes as specs", async () => {
    const element = await mountWith({
      attributes: { origin: "Ethiopia", roast: 2, organic: true },
    });
    expect(element.props.product.specs).toEqual({
      origin: "Ethiopia",
      roast: "2",
      organic: "true",
    });
  });

  it("keeps the machine rule primitives-only, so agent and feed agree", async () => {
    // The PDP spec table DOES show `notes`. Agent/feed parity is the trade;
    // see the docblock on the mount.
    const element = await mountWith({
      attributes: { origin: "Ethiopia", notes: ["bergamot", "jasmine"] },
    });
    expect(element.props.product.specs).toEqual({ origin: "Ethiopia" });
  });

  it("says nothing about specifications when the product has none", async () => {
    const element = await mountWith({ attributes: null });
    expect(element.props.product.specs).toBeUndefined();
  });
});
