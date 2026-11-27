import "server-only";

import { brand } from "@/brand.config";
import { getFeatureGateState } from "@/lib/brand";
import { ToolRefusal } from "@/lib/tools/refusal";
import type { ToolCtx } from "@/lib/tools/types";

/**
 * Bounds on the discount codes an API key may mint (DRØM133-a, runtime flag
 * `apiDiscountBounds`). Shared by discounts.create/toggle and
 * marketing.create_campaign so the three agree on one rule.
 *
 * The actor is the caller's class: REST (/api/v1/tools) and MCP (/api/mcp) both
 * stamp an authenticated key as `apikey:<id>`; the admin chat is
 * `operator-chat:<id>` and /admin server actions never reach a tool. Only the
 * key class is bounded — the owner's own surfaces keep their old behaviour.
 */
export type DiscountBounds = { maxPercent: number; maxFixedMinor: number };

/** The caps to apply to this call, or null for the old, unbounded behaviour. */
export async function apiKeyDiscountBounds(ctx: ToolCtx): Promise<DiscountBounds | null> {
  if (!ctx.actor.startsWith("apikey:")) return null;
  // Fail closed: an unreadable flag row would fall back to brand.config's
  // `false` and drop the bound for a flag the shop turned on. A read that fails
  // once can still leave the write below working, so the key is refused.
  const { available, features } = await getFeatureGateState();
  if (!available) {
    throw new Error(
      "Discount codes cannot be created or switched on with an API key right now: the site's feature flags could not be read (database unreachable). Nothing was changed. Try again shortly.",
    );
  }
  if (!features.apiDiscountBounds) return null;
  return brand.policies.apiDiscountCaps;
}

/**
 * Refuses a key-minted code that would be unlimited or never expire.
 *
 * 409, not 422: both fields are optional in the published JSON Schema, so the
 * body is valid. It is the shop's state (the flag, and the caller being a key)
 * that says no, and #790 keeps 422 for `validation_failed` with Zod `issues`.
 */
export function requireUsageLimitAndExpiry<T extends { usageLimit?: number; validUntil?: string }>(
  args: T,
): asserts args is T & { usageLimit: number; validUntil: string } {
  const missing = [
    args.usageLimit === undefined ? "usageLimit" : null,
    args.validUntil === undefined ? "validUntil" : null,
  ].filter(Boolean);
  if (missing.length === 0) return;
  throw new ToolRefusal(
    "discount_limit_and_expiry_required",
    `A discount code created with an API key must set both usageLimit and validUntil on this shop ` +
      `(missing: ${missing.join(", ")}). Nothing was created.`,
  );
}

function describe(type: "percent" | "fixed", value: number): string {
  // Base-currency minor units, 2 decimals (the assumption lib/money.ts documents).
  return type === "percent"
    ? `${value}%`
    : `${(value / 100).toFixed(2)} ${brand.policies.currency}`;
}

/** Why this value is above the shop's cap, or null when it is within it. */
export function overCapReason(
  type: "percent" | "fixed",
  value: number,
  bounds: DiscountBounds,
): string | null {
  const cap = type === "percent" ? bounds.maxPercent : bounds.maxFixedMinor;
  if (value <= cap) return null;
  return `${describe(type, value)} is above this shop's cap of ${describe(type, cap)} for codes created with an API key`;
}

/**
 * The refusal for a code above the cap that an API key may not switch on or
 * re-price. `reason` must come from the caller's own value (overCapReason on the
 * input) or from capOnlyReason: a ToolRefusal message never carries a DB row.
 */
export function aboveCap(message: string): ToolRefusal {
  return new ToolRefusal("discount_above_cap", message);
}

/** overCapReason without the stored value, for a refusal about an existing row. */
export function capOnlyReason(type: "percent" | "fixed", bounds: DiscountBounds): string {
  const cap = type === "percent" ? bounds.maxPercent : bounds.maxFixedMinor;
  return `its value is above this shop's cap of ${describe(type, cap)} for codes created with an API key`;
}

export function draftNotice(code: string, reason: string): string {
  return (
    `Discount code ${code} was created switched OFF: ${reason}. ` +
    `It cannot be redeemed until an admin reviews it and switches it on in /admin/rabatkoder.`
  );
}
