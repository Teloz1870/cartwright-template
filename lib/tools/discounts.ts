import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

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
});

const discountToggledOutput = z.strictObject({
  code: z.string(),
  active: z.boolean(),
});

export const listDiscounts = defineTool({
  name: "discounts.list",
  description: "List discount codes, optionally only active ones. Includes usage statistics.",
  scope: "discounts:read",
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
    "Create a discount code. type='percent' takes value 1-100; type='fixed' takes value in ore. The code is case-insensitive (stored uppercase).",
  scope: "discounts:write",
  input: createInput,
  output: discountCreatedOutput,
  handler: async (args, ctx) => {
    return withAudit({ actor: ctx.actor, tool: "discounts.create", args, ip: ctx.ip, userAgent: ctx.userAgent }, async () => {
      const created = await prisma.discountCode.create({
        data: {
          code: args.code,
          type: args.type,
          value: args.value,
          validUntil: args.validUntil ? new Date(args.validUntil) : null,
          usageLimit: args.usageLimit ?? null,
          active: true,
        },
      });
      return { id: created.id, code: created.code };
    });
  },
});

export const toggleDiscount = defineTool({
  name: "discounts.toggle",
  description:
    "Activate/deactivate a discount code. If 'active' is omitted, the current status is toggled.",
  scope: "discounts:write",
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
        if (!existing) throw new Error(`Discount code not found: ${args.code}`);

        const nextActive = args.active ?? !existing.active;
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
