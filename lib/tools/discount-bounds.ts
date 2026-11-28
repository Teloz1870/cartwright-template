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
export type DiscountBounds = {
  maxPercent: number;
  maxFixedMinor: number;
  /** Most uses a key's code may allow (DRØM133-b). */
  maxUsageLimit: number;
  /** Furthest a key's code may expire, in days after the call (DRØM133-b). */
  maxValidDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The caps to apply to this call, or null for the old, unbounded behaviour. */
export async function apiKeyDiscountBounds(ctx: ToolCtx): Promise<DiscountBounds | null> {
  if (!ctx.actor.startsWith("apikey:")) return null;
  // Fail closed: an unreadable flag row would fall back to brand.config's
  // `false` and drop the bound for a flag the shop turned on. A read that fails
  // once can still leave the write below working, so the key is refused.
  // The cost is deliberate (DRØM133-b d): the flag is unknown here, so a shop
  // that never turned it on refuses a key's discount calls during the outage
  // too. Knowing the flag without the database would need a second source.
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
 * Why a key's code is not one it may create live: its value is above the cap,
 * or its usageLimit / validUntil is beyond the ceilings (DRØM133-b), or null.
 * Built from the caller's own input only, so a refusal may carry it. Over a
 * ceiling is treated exactly like over the value cap (#788): a new code is a
 * draft, a live one is not re-priced (409), so a key has one rule to learn.
 */
export function overBoundsReason(
  input: { type: "percent" | "fixed"; value: number; usageLimit: number; validUntil: string },
  bounds: DiscountBounds,
  now: Date,
): string | null {
  const reasons = [overCapReason(input.type, input.value, bounds)];
  if (input.usageLimit > bounds.maxUsageLimit) {
    reasons.push(
      `a usageLimit of ${input.usageLimit} is above this shop's cap of ${bounds.maxUsageLimit} uses for codes created with an API key`,
    );
  }
  if (new Date(input.validUntil).getTime() > now.getTime() + bounds.maxValidDays * DAY_MS) {
    reasons.push(
      `validUntil ${input.validUntil} is more than ${bounds.maxValidDays} days ahead, this shop's cap for codes created with an API key`,
    );
  }
  const found = reasons.filter((r): r is string => r !== null);
  return found.length === 0 ? null : found.join("; and ");
}

/**
 * Whether a STORED row is one a key could have created live now: value within
 * the cap, and a usageLimit and validUntil within the ceilings. A row with no
 * limit or no expiry (an admin's code) is not — discounts.toggle must not let a
 * key switch it on (DRØM133-b c). The caller words the refusal with
 * capOnlyReason/limitsOnlyReason: a ToolRefusal message never carries a DB row.
 */
export function storedRowWithinBounds(
  row: { type: string; value: number; usageLimit: number | null; validUntil: Date | null },
  bounds: DiscountBounds,
  now: Date,
): "ok" | "value" | "limits" {
  const kind = row.type === "percent" ? "percent" : "fixed";
  if (overCapReason(kind, row.value, bounds) !== null) return "value";
  if (row.usageLimit === null || row.usageLimit > bounds.maxUsageLimit) return "limits";
  if (row.validUntil === null || row.validUntil.getTime() > now.getTime() + bounds.maxValidDays * DAY_MS) {
    return "limits";
  }
  return "ok";
}

/** The ceilings without the stored row's values, for a refusal about an existing row. */
export function limitsOnlyReason(bounds: DiscountBounds): string {
  return (
    `a code an API key switches on must have a usage limit of at most ${bounds.maxUsageLimit} uses ` +
    `and an expiry at most ${bounds.maxValidDays} days ahead on this shop`
  );
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
