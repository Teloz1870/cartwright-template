import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import type { MergedBrand } from "@/lib/brand";
import {
  getDescriptor,
  RUNTIME_TOGGLEABLE_KEYS,
} from "@/lib/feature-flags/manifest";
import { computeFeatureStatuses } from "@/lib/feature-flags/status";

describe("multi-currency feature integrity", () => {
  it("keeps charging currency config-sovereign", () => {
    expect(getDescriptor("multiCurrency")?.tier).toBe("compile-time");
    expect(RUNTIME_TOGGLEABLE_KEYS.has("multiCurrency")).toBe(false);
  });

  it("reports an already-enabled flag whose currency precondition drifted", () => {
    const drifted = {
      ...brand,
      features: { ...brand.features, currencySwitcher: true, multiCurrency: true },
      policies: {
        ...brand.policies,
        supportedCurrencies: {
          [brand.policies.currency]: { rate: 1, label: "Base" },
        },
      },
    } as unknown as MergedBrand;

    const status = computeFeatureStatuses(drifted).find(
      (feature) => feature.key === "multiCurrency",
    );
    expect(status?.enabled).toBe(true);
    expect(status?.blockedReason).toContain("at least 2 currencies");
  });
});
