import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { ToolRefusal } from "@/lib/tools/refusal";
import {
  aboveCap,
  apiKeyDiscountBounds,
  capOnlyReason,
  draftNotice,
  overCapReason,
  requireUsageLimitAndExpiry,
  type DiscountBounds,
} from "@/lib/tools/discount-bounds";

// `code` is the only unique column a create can collide on (the id is
// generated). A duplicate is the caller's to resolve, so it is a refusal with a
// public message, not an opaque 500 that invites a retry. Shared with
// marketing.create_campaign's draft create.
export async function createRefusingDuplicate<T>(code: string, create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "P2002") {
      throw new ToolRefusal(
        "discount_code_exists",
        `Discount code ${code} already exists. Choose a new code, or change the existing one with discounts.toggle.`,
      );
    }
    throw e;
  }
}

/** Longest code a tool mints (after trim). Shared with marketing.create_campaign. */
export const DISCOUNT_CODE_MAX = 64;

const createInput = z
  .object({
    code: z
      .string()
      // `.trim()` BEFORE `.min(3)`: zod runs a string chain in written order,
      // so trimming afterwards would measure the padding — `"  ab  "` (and
      // even `"   "`) would pass the minimum and then be stored shorter than
      // this tool advertises. See `toggleInput` below and lib/validation.ts.
      .trim()
      .min(3)
      // A refusal's message echoes the code (discount_code_exists): bound it so
      // the 409 detail cannot carry an arbitrarily large string back.
      .max(DISCOUNT_CODE_MAX)
      .transform((s) => s.toUpperCase()),
    type: z.enum(["percent", "fixed"]),
    value: z.number().int().positive(),
    validUntil: z.string().datetime().optional(),
    usageLimit: z.number().int().positive().optional(),
  })
  .refine(
    (d) => d.type !== "percent" || d.value <= 100,
    "Percentage discount cannot exceed 100",
  );

const toggleInput = z.object({
  code: z
    .string()
    // Normalises exactly like `createInput.code`, but deliberately NOT to the
    // same minimum: `min(3)` is a MINTING rule, and this is a LOOKUP key. A
    // shop can already hold a 1-2 character row — minted by the very bug this
    // file fixes, and redeemable, since checkout only requires a truthy code.
    // Under the OLD chain that row was reachable only through the same padding
    // trick (`toggle({code: " ab "})`); carrying `min(3)` over to the trimmed
    // value would have removed the trick and left the agent no way in.
    // The empty row the bug could also mint is deliberately NOT addressable
    // here — it is inert at checkout, and a human admin flips either by `id`
    // (app/admin/actions.ts:274). This split is about the agent path.
    .trim()
    .min(1)
    .transform((s) => s.toUpperCase()),
  active: z.boolean().optional(), // hvis udeladt: flip
});

const listInput = z.object({
  onlyActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const discountOutput = z.strictObject({
  id: z.string(),
  code: z.string(),
  type: z.string(),
  value: z.number().int(),
  validUntil: z.iso.datetime().nullable(),
  usageLimit: z.number().int().nullable(),
  usageCount: z.number().int().min(0),
  active: z.boolean(),
});

const discountCreatedOutput = z.strictObject({
  id: z.string(),
  code: z.string(),
  // Only on a call bounded by `apiDiscountBounds` (an API key, flag on): the
  // unbounded ack stays exactly {id, code}.
  active: z.boolean().optional(),
  notice: z.string().optional(),
});

const discountToggledOutput = z.strictObject({
  code: z.string(),
  active: z.boolean(),
});

export const listDiscounts = defineTool({
  name: "discounts.list",
  description: "List discount codes, optionally only active ones. Includes usage statistics.",
  scope: "discounts:read",
  gate: { ecommerce: true },
  input: listInput,
  output: z.array(discountOutput),
  skipAudit: true,
  handler: async (args) => {
    const where = args.onlyActive ? { active: true } : {};
    const codes = await prisma.discountCode.findMany({
      where,
      orderBy: { code: "asc" },
      take: args.limit,
    });
    return codes;
  },
});

export const createDiscount = defineTool({
  name: "discounts.create",
  description:
    "Create a discount code. type='percent' takes value 1-100; type='fixed' takes value in ore. The code is case-insensitive (stored uppercase). With the apiDiscountBounds flag on, an API key must set usageLimit and validUntil, and a code above the shop's caps is created switched off (the response says so).",
  scope: "discounts:write",
  gate: { ecommerce: true },
  input: createInput,
  output: discountCreatedOutput,
  handler: async (args, ctx) => {
    return withAudit({ actor: ctx.actor, tool: "discounts.create", args, ip: ctx.ip, userAgent: ctx.userAgent }, async () => {
      const bounds = await apiKeyDiscountBounds(ctx);
      if (bounds) {
        requireUsageLimitAndExpiry(args);
        const reason = overCapReason(args.type, args.value, bounds);
        const created = await createRefusingDuplicate(args.code, () =>
          prisma.discountCode.create({
            data: {
              code: args.code,
              type: args.type,
              value: args.value,
              validUntil: new Date(args.validUntil),
              usageLimit: args.usageLimit,
              active: reason === null,
            },
          }),
        );
        return reason === null
          ? { id: created.id, code: created.code, active: true }
          : { id: created.id, code: created.code, active: false, notice: draftNotice(created.code, reason) };
      }
      const created = await createRefusingDuplicate(args.code, () =>
        prisma.discountCode.create({
          data: {
            code: args.code,
            type: args.type,
            value: args.value,
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            usageLimit: args.usageLimit ?? null,
            active: true,
          },
        }),
      );
      return { id: created.id, code: created.code };
    });
  },
});

export const toggleDiscount = defineTool({
  name: "discounts.toggle",
  description:
    "Activate/deactivate a discount code. If 'active' is omitted, the current status is toggled.",
  scope: "discounts:write",
  gate: { ecommerce: true },
  input: toggleInput,
  output: discountToggledOutput,
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "discounts.toggle",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.discountCode.findUnique({
            where: { code: args.code },
            select: { active: true },
          }),
      },
      async () => {
        const existing = await prisma.discountCode.findUnique({
          where: { code: args.code },
        });
        if (!existing) {
          throw new ToolRefusal("discount_not_found", `Discount code not found: ${args.code}`, 404);
        }

        const nextActive = args.active ?? !existing.active;
        // A key cannot switch on a code it would have had to create as a draft
        // (or the cap on discounts.create would be one call deep).
        const bounds = nextActive ? await apiKeyDiscountBounds(ctx) : null;
        const kind = existing.type === "percent" ? "percent" : "fixed";
        const reason = bounds ? overCapReason(kind, existing.value, bounds) : null;
        // The message names the cap, not the stored value: a refusal's text is
        // public and is never built from a DB row (lib/tools/refusal.ts).
        const staysOff = (b: DiscountBounds) =>
          aboveCap(
            `Discount code ${args.code} stays off: ${capOnlyReason(kind, b)}. ` +
              `An admin switches it on in /admin/rabatkoder.`,
          );
        if (reason && bounds) {
          if (!existing.active) throw staysOff(bounds);
          // An admin switched it on. The key's "on" stays a no-op: the write only
          // matches a row that is still on, so a switch-off landing after the
          // read above is not undone.
          const kept = await prisma.discountCode.updateMany({
            where: { id: existing.id, active: true },
            data: { active: true },
          });
          if (kept.count === 0) throw staysOff(bounds);
          return { code: existing.code, active: true };
        }
        const updated = await prisma.discountCode.update({
          where: { id: existing.id },
          data: { active: nextActive },
          select: { code: true, active: true },
        });
        return updated;
      },
    );
  },
});

export const discountsTools = [listDiscounts, createDiscount, toggleDiscount];
