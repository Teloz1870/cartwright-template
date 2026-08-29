import { describe, it, expect } from "vitest";

import { buildAcpFeed, type AcpSeller } from "@/lib/feeds/acp-feed";
import type { CatalogFeedItem } from "@/lib/feeds/catalog-feed";

/**
 * Locks the /api/acp/feed serializer to the OpenAI Agentic Commerce Protocol
 * product-feed schema (developers.openai.com/commerce/specs/feed). Pure function
 * → no Prisma/env mocking needed.
 */

const seller: AcpSeller = {
  name: "Solbrillen",
  url: "https://solbrillen.dk",
  storeCountry: "DK",
  targetCountries: ["DK"],
  privacyPolicyUrl: "https://solbrillen.dk/da/privacy",
  tosUrl: "https://solbrillen.dk/da/info/terms",
};

const item: CatalogFeedItem = {
  id: "aviator-sku-1",
  title: "Aviator",
  description: "Klassiske aviator-solbriller",
  priceMinor: 12900,
  currency: "DKK",
  availability: "in_stock",
  url: "https://solbrillen.dk/product/aviator",
  imageUrl: "https://solbrillen.dk/img/aviator.jpg",
  brand: "RayCraft",
  category: "Solbriller",
};

describe("buildAcpFeed", () => {
  it("emits ACP field names + a '<major> <ISO4217>' price string, one JSONL line per item", () => {
    const out = buildAcpFeed([item], seller);
    expect(out.endsWith("\n")).toBe(true);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(1);

    const rec = JSON.parse(lines[0]);
    expect(rec.item_id).toBe("aviator-sku-1");
    expect(rec.title).toBe("Aviator");
    expect(rec.url).toBe("https://solbrillen.dk/product/aviator");
    expect(rec.image_url).toBe("https://solbrillen.dk/img/aviator.jpg");
    expect(rec.price).toBe("129.00 DKK"); // 12900 øre → major units + currency
    expect(rec.availability).toBe("in_stock");
    expect(rec.brand).toBe("RayCraft");

    // No legacy Google-Merchant-near names leak after the spec-pin.
    expect(rec).not.toHaveProperty("link");
    expect(rec).not.toHaveProperty("image_link");
    expect(rec).not.toHaveProperty("enable_checkout");
    expect(rec).not.toHaveProperty("product_category");
  });

  it("includes the seller block + eligibility flags (discovery default)", () => {
    const rec = JSON.parse(buildAcpFeed([item], seller).trim());
    expect(rec.seller_name).toBe("Solbrillen");
    expect(rec.seller_url).toBe("https://solbrillen.dk");
    expect(rec.store_country).toBe("DK");
    expect(rec.target_countries).toEqual(["DK"]);
    expect(rec.seller_privacy_policy).toBe("https://solbrillen.dk/da/privacy");
    expect(rec.seller_tos).toBe("https://solbrillen.dk/da/info/terms");
    expect(rec.is_eligible_search).toBe(true);
    expect(rec.is_eligible_checkout).toBe(false); // Phase A = discovery only
  });

  it("omits image_url and brand when the product has none (they are absent, not null)", () => {
    const rec = JSON.parse(
      buildAcpFeed([{ ...item, imageUrl: null, brand: null }], seller).trim(),
    );
    expect(rec).not.toHaveProperty("image_url");
    expect(rec).not.toHaveProperty("brand");
    expect(rec.item_id).toBe("aviator-sku-1"); // still emitted
  });

  it("returns an empty string for an empty catalogue", () => {
    expect(buildAcpFeed([], seller)).toBe("");
  });

  it("honours an eligibleCheckout override (Phase B go-live)", () => {
    const rec = JSON.parse(
      buildAcpFeed([item], { ...seller, eligibleCheckout: true }).trim(),
    );
    expect(rec.is_eligible_checkout).toBe(true);
    expect(rec.is_eligible_search).toBe(true);
  });
});
