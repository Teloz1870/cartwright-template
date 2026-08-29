import { describe, expect, it, vi } from "vitest";
import { discountCodeSchema } from "@/lib/validation";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/cart", () => ({ getCart: vi.fn() }));

/**
 * The two `DiscountCode.code` surfaces that had no test of their own:
 * `discountCodeSchema` (lib/validation.ts), behind the admin discount form
 * (`app/admin/actions.ts` → `createDiscountCode`), and `discounts.try_apply`'s
 * input (lib/tools/customer.ts), the shopper-facing lookup. The `discounts.*`
 * and `marketing.*` tools are covered in their own suites.
 *
 * What this pins is the chain ORDER, not the individual rules: zod's `.trim()`
 * is a string-level modifier that rewrites the value before the checks that
 * follow it, so `.min(3)` placed first measured the padding rather than the
 * value. A form field is exactly where padding arrives — a pasted code carries
 * the spaces around it — so `"  ab  "` reached the DB as the 2-character code
 * `"AB"`, and `"   "` as the empty string, in a column declared `@unique`.
 *
 * What the resulting rows can do, precisely:
 *   - a 1-2 character code IS redeemable. Checkout only requires a truthy code
 *     (`lib/orders/create.ts:105-107`), so the bug's real product is a live
 *     code weaker than the minimum the tool advertises.
 *   - the empty code is not redeemable at checkout, but it was not inert
 *     either: before this change `discounts.try_apply` (shopper-facing,
 *     `cart:write`) accepted `" "` and looked the empty row up
 *     (`lib/tools/customer.ts`). That leg is closed here, as is the one in
 *     `discounts.toggle` (which reached `""` via `"   "`). What is NOT closed
 *     is anything that reads an existing row: `/admin/rabatkoder` still renders
 *     one as a blank cell (`app/admin/rabatkoder/page.tsx:52-54`) and
 *     `discounts.list` still returns it. This change ships no migration — it
 *     stops new ones being minted, it does not clean up old.
 *
 * ACP was never affected: its own input schemas already had the right order
 * (`lib/acp/index.ts:138` and `:147` — `z.string().trim().min(1).max(80)`),
 * enforced at the HTTP boundary, so a whitespace-only `discount_code` is
 * refused long before `discountForCode`'s truthy guard at `:264` — which tests
 * the value before trimming it (`:266`), so `" "` would have passed it.
 */
describe("discountCodeSchema — the admin form's discount code", () => {
  it("rejects a code that is shorter than min(3) once trimmed", () => {
    for (const code of ["ab", "  ab  ", "   ", " a ", ""]) {
      const parsed = discountCodeSchema.safeParse({ code, type: "percent", value: 10 });
      expect(parsed.success, JSON.stringify(code)).toBe(false);
    }
  });

  it("still trims and uppercases a valid code", () => {
    const parsed = discountCodeSchema.parse({ code: "  save20  ", type: "percent", value: 10 });
    expect(parsed.code).toBe("SAVE20");
  });

  it("surfaces the length message the form renders", () => {
    // app/admin/actions.ts:246 returns `error.issues[0].message` verbatim as the
    // form's error, so the wording reaches the admin's screen — pinning it keeps
    // a schema edit from silently changing what the form says.
    const parsed = discountCodeSchema.safeParse({ code: "  ab  ", type: "percent", value: 10 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Code must be at least 3 characters");
    }
  });
});

describe("discounts.try_apply — the shopper-facing lookup key", () => {
  it("refuses a whitespace-only code instead of looking up the empty one", async () => {
    // The same check-before-normaliser shape, one step removed: this schema's
    // normaliser used to live at the call site, so `.min(1)` measured the raw
    // string — `" "` passed, and the lookup asked for `""`, which is exactly
    // the row the pre-fix `discounts.create` could mint.
    const { tryApplyDiscount } = await import("@/lib/tools/customer");
    for (const code of ["", " ", "   ", "\t"]) {
      expect(() => tryApplyDiscount.input.parse({ code }), JSON.stringify(code)).toThrow();
    }
    // The lookup key is now normalised in ONE place — the schema. The parse
    // output IS what `findUnique` receives (the call site no longer re-trims
    // or re-uppercases), so this assertion pins the full normalisation.
    expect(tryApplyDiscount.input.parse({ code: "  save20  " }).code).toBe("SAVE20");
  });
});
