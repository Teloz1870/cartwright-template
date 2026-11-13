import {
  MODULE_GATES,
  type SurfaceGate,
  type ToolGate,
  type ToolSurface,
} from "@/lib/surface/gates";

/**
 * The rule the agent surface will follow: a switched-off tool cannot be told
 * apart from one that was never installed. This is the rule alone, pure and
 * read by no route yet. `listTools` and `getTool` stay unfiltered, and the
 * storefront chat's allowlist (CUSTOMER_TOOL_ALLOWLIST) never comes through here.
 *
 * It takes `{ gate }` rather than `AnyTool` because `core` carries this file and
 * a profile without the `mcp` module has no lib/tools.
 */

/** What a gate reads. `getBrand()` satisfies it. */
export type ShopContext = {
  ecommerceEnabled: boolean;
  features: Record<string, boolean | undefined>;
};

/**
 * Who is asking, when that is narrower than the shop. `surface` is the class an
 * API key's preset carries: with it the caller sees that class and no other.
 * Without one it sees both `operate` and `build`, which is how an existing key
 * stays as it is. `storefront` is not on offer, so a caller can only ever narrow
 * what the shop shows.
 *
 * Scopes are not read here: being visible does not authorize a call.
 */
export type SurfaceCaller = {
  surface?: Exclude<ToolSurface, "storefront">;
};

function passes(gate: SurfaceGate, shop: ShopContext): boolean {
  if (gate.ecommerce && !shop.ecommerceEnabled) return false;
  return (gate.flags ?? []).every((flag) => shop.features[flag]);
}

/** Is this module on for this shop? A slug with no gate is always active. */
export function isModuleActive(slug: string, shop: ShopContext): boolean {
  const gate = MODULE_GATES[slug];
  return !gate || passes(gate, shop);
}

/** Does this tool exist as far as this shop, and this caller, can tell? */
export function isVisible(
  tool: { gate?: ToolGate },
  shop: ShopContext,
  caller?: SurfaceCaller,
): boolean {
  const gate = tool.gate ?? {};
  if (!passes(gate, shop)) return false;
  const surface = gate.surface ?? "operate";
  if (surface === "storefront") return false;
  return !caller?.surface || caller.surface === surface;
}
