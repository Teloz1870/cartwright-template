import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { getBrand, type MergedBrand } from "@/lib/brand";
import {
  FEATURE_MANIFEST,
  IDENTITY_DESCRIPTORS,
  type FeatureDescriptor,
  type FeatureTier,
} from "./manifest";
import { enableBlockReason } from "./resolve";

/**
 * Resolved status pr. feature — fælles datakilde for admin-UI'et
 * (/admin/features) OG AI-tool'et (features.get). Begge ser dermed nøjagtig
 * samme manifest-drevne billede.
 */
export type FeatureStatus = FeatureDescriptor & {
  /** Resolved værdi (brand.config-default merged med DB-override). */
  enabled: boolean;
  /** brand.config-default — så UI kan vise "afviger fra ship-default". */
  configDefault: boolean;
  /** Resolved ≠ default ⇒ et DB-override er aktivt for denne key. */
  overridden: boolean;
  /**
   * Hvis feature er OFF og runtime-toggleable men ikke må tændes endnu
   * (dependency/precondition), forklaringen — ellers null. Driver "disabled"-
   * tilstanden i admin og advarer AI før et forsøg på at tænde.
   */
  blockedReason: string | null;
};

export type IdentityStatus = {
  key: string;
  label: string;
  description: string;
  value: string | boolean;
};

export type FeatureView = {
  features: FeatureStatus[];
  identity: IdentityStatus[];
};

export function computeFeatureStatuses(brand: MergedBrand): FeatureStatus[] {
  const defaults = brandDefaults.features as Record<string, boolean>;
  return FEATURE_MANIFEST.map((d) => {
    const enabled = Boolean(brand.features[d.key]);
    const configDefault = Boolean(defaults[d.key]);
    const blockedReason =
      d.runtimeToggleable && d.implemented && !enabled
        ? enableBlockReason(d, brand)
        : null;
    return {
      ...d,
      enabled,
      configDefault,
      overridden: enabled !== configDefault,
      blockedReason,
    };
  });
}

function computeIdentity(brand: MergedBrand): IdentityStatus[] {
  const values: Record<string, string | boolean> = {
    mode: brand.mode,
    ecommerceEnabled: brand.ecommerceEnabled,
    industryTemplate: brand.industryTemplate,
  };
  return IDENTITY_DESCRIPTORS.map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
    value: values[d.key],
  }));
}

/** Hele billedet (features + identity), resolved via getBrand(). */
export async function getFeatureView(): Promise<FeatureView> {
  const brand = await getBrand();
  return {
    features: computeFeatureStatuses(brand),
    identity: computeIdentity(brand),
  };
}

/** Grupperet til UI-sektioner. Bevarer manifest-rækkefølgen pr. gruppe. */
export function groupByCategory(
  statuses: FeatureStatus[],
): { group: string; tier: FeatureTier; items: FeatureStatus[] }[] {
  const order: string[] = [];
  const map = new Map<string, FeatureStatus[]>();
  for (const s of statuses) {
    if (!map.has(s.group)) {
      map.set(s.group, []);
      order.push(s.group);
    }
    map.get(s.group)!.push(s);
  }
  return order.map((group) => {
    const items = map.get(group)!;
    return { group, tier: items[0].tier, items };
  });
}
