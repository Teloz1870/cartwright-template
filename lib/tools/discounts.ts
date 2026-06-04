import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

const createInput = z
  .object({
    code: z
      .string()
      .min(3)
      .transform((s) => s.trim().toUpperCase()),
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
    .min(3)
    .transform((s) => s.trim().toUpperCase()),
  active: z.boolean().optional(), // hvis udeladt: flip
});

const listInput = z.object({
  onlyActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listDiscounts = defineTool({
  name: "discounts.list",
  description: "List discount codes, optionally only active ones. Includes usage statistics.",
  scope: "discounts:read",
  input: listInput,
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
