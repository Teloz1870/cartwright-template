import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { applyFeatureOverride } from "@/lib/feature-flags/apply";
import { getFeatureView } from "@/lib/feature-flags/status";
import { RUNTIME_TOGGLEABLE_KEYS } from "@/lib/feature-flags/manifest";

/**
 * AI-tools for feature-management. Spejler admin-UI'et via det samme delte
 * applyFeatureOverride/getFeatureView, så AI'en og operatøren altid ser og
 * ændrer feature-state via ÉT kodespor (samme allowlist, validering, audit).
 *
 * Scopes: features:read (get) + features:write (set). Begge er i
 * ADMIN_CHAT_SCOPES men IKKE CUSTOMER_CHAT_SCOPES — storefront-kunder kan
 * aldrig toggle features.
 */

const runtimeKeys = Array.from(RUNTIME_TOGGLEABLE_KEYS) as [string, ...string[]];

export const getFeaturesTool = defineTool({
  name: "features.get",
  description:
    "List all shop features with their resolved on/off state, tier (runtime/compile-time/identity), whether they can be toggled live, dependency status, and shop identity. Read-only.",
  scope: "features:read",
  input: z.object({}),
  skipAudit: true,
  handler: async () => getFeatureView(),
});

export const setFeatureTool = defineTool({
  name: "features.set",
  description:
    "Turn a runtime-toggleable feature on or off. Only features whose tier is 'runtime' can be set (see features.get); compile-time and identity flags cannot be changed here. Dependencies/preconditions are enforced. Requires confirm: true. Revertible via audit.revert.",
  scope: "features:write",
  revertible: true,
  input: z.object({
    key: z.enum(runtimeKeys, {
      error: "key must be a runtime-toggleable feature (see features.get)",
    }),
    enabled: z.boolean(),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  examples: [
    {
      name: "Enable product reviews",
      body: { key: "reviews", enabled: true, confirm: true },
    },
  ],
  handler: async (args, ctx) => {
    const result = await applyFeatureOverride(args.key, args.enabled, ctx.actor);
    if (!result.ok) {
      // Validering afvist (allowlist/dependency/precondition) → bobl op som
      // fejl så AI'en får en klar besked. Afviste forsøg auditeres ikke
      // (applyFeatureOverride auditerer kun den faktiske DB-skrivning).
      throw new Error(result.error);
    }
    return result;
  },
});

export const featuresTools = [getFeaturesTool, setFeatureTool];
