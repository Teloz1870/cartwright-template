import "server-only";

import { brand as brandDefaults } from "@/brand.config";
import { prisma } from "@/lib/db";
import { getBrand, invalidateBrandCache, type MergedBrand } from "@/lib/brand";
import { withAudit, type AuditActor } from "@/lib/audit";
import {
  RUNTIME_TOGGLEABLE_KEYS,
  getDescriptor,
  type FeatureDescriptor,
  type FeatureKey,
} from "./manifest";

/**
 * Synkront tjek af om en feature MÅ tændes lige nu (dependencies + precondition
 * opfyldt). Returnerer en forklarende grund hvis blokeret, ellers null. Delt
 * af validateToggle (apply-path) og status-visningen (lib/feature-flags/status.ts)
 * så admin-UI'ets "disabled"-tilstand og server-validering altid er enige.
 */
export function enableBlockReason(
  desc: FeatureDescriptor,
  brand: MergedBrand,
): string | null {
  for (const dep of desc.dependsOn ?? []) {
    if (!brand.features[dep]) {
      const depDesc = getDescriptor(dep);
      return `Kræver at '${depDesc?.label ?? dep}' er aktiveret først.`;
    }
  }
  if (desc.precondition?.kind === "ecommerce" && !brand.ecommerceEnabled) {
    return "Kræver at e-commerce er aktiveret (webshop-mode).";
  }
  if (desc.precondition?.kind === "minCurrencies") {
    const count = Object.keys(brand.policies?.supportedCurrencies ?? {}).length;
    if (count < desc.precondition.value) {
      return `Kræver mindst ${desc.precondition.value} valutaer i supportedCurrencies (har ${count}).`;
    }
  }
  return null;
}

/**
 * Delt kerne for at sætte/nulstille et feature-override. Bruges af BÅDE
 * admin-server-action'en (/admin/features) OG AI-tool'et (lib/tools/features.ts)
 * — ét kodespor, så allowlist-håndhævelse, dependency-validering og audit
 * aldrig kan divergere mellem de to surfaces.
 */

export type ToggleValidation = { ok: true } | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; key: FeatureKey; enabled: boolean; reset: boolean }
  | { ok: false; error: string };

/**
 * Validér om et toggle er tilladt. At slukke (enabled=false) er altid tilladt;
 * at tænde (true) kræver at dependencies + precondition er opfyldt.
 */
export async function validateToggle(
  key: string,
  enabled: boolean,
): Promise<ToggleValidation> {
  if (!RUNTIME_TOGGLEABLE_KEYS.has(key as FeatureKey)) {
    return { ok: false, error: `'${key}' kan ikke ændres live (ikke en runtime-feature).` };
  }
  const desc = getDescriptor(key as FeatureKey);
  if (!desc) return { ok: false, error: `Ukendt feature '${key}'.` };
  if (!desc.implemented) {
    return { ok: false, error: `'${desc.label}' er ikke implementeret endnu.` };
  }
  // Slukning er altid sikkert.
  if (!enabled) return { ok: true };

  const brand = await getBrand();
  const reason = enableBlockReason(desc, brand);
  return reason ? { ok: false, error: reason } : { ok: true };
}

function parseOverrides(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    /* korrupt JSON → behandl som tomt */
  }
  return {};
}

/**
 * Sæt et feature-override. Hvis den ønskede værdi er == brand.config-default
 * SLETTES key'en fra override-bloben (så den kun rummer reelle afvigelser, og
 * fremtidige default-ændringer ikke maskeres). Wrappet i withAudit og
 * invaliderer getBrand-cachen så ændringen slår igennem ved næste render.
 */
export async function applyFeatureOverride(
  key: string,
  enabled: boolean,
  actor: AuditActor,
): Promise<ApplyResult> {
  const valid = await validateToggle(key, enabled);
  if (!valid.ok) return { ok: false, error: valid.error };

  const typedKey = key as FeatureKey;
  const configDefault = (brandDefaults.features as Record<string, boolean>)[key];
  const reset = enabled === configDefault;

  try {
    await withAudit(
      {
        actor,
        tool: "features.set",
        args: { key, enabled, reset },
        before: async () => {
          const row = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { featureOverridesJson: true },
          });
          return row?.featureOverridesJson ?? null;
        },
      },
      async () => {
        const row = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
          select: { featureOverridesJson: true },
        });
        const overrides = parseOverrides(row?.featureOverridesJson);
        if (reset) {
          delete overrides[key];
        } else {
          overrides[key] = enabled;
        }
        const json = Object.keys(overrides).length
          ? JSON.stringify(overrides)
          : null;

        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { featureOverridesJson: json },
          create: {
            id: 1,
            storeName: "Cartwright",
            heroImage: "",
            announcement: "",
            featureOverridesJson: json,
          },
        });
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunne ikke gemme ændringen.",
    };
  }

  invalidateBrandCache();
  return { ok: true, key: typedKey, enabled, reset };
}
