import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

// ── PR-demo-tool ─────────────────────────────────────────────────────────────
//
// Dette er tool'et journalister vil filme. Ét tool-kald → tre mutationer:
//   1. Opret rabatkode (DiscountCode)
//   2. Opdater announcement-bar-tekst (BrandingSettings)
//   3. Skriv preview-fil til .mail-previews/ (genbruger mailer-mønsteret)
//
// Det er bevidst en composite: det ER pointen at AI kan orkestrere flere
// trin på én gang. Hvert sub-step skrives separat til audit-loggen så
// audit.revert kan unrollen individuelt.
//
// Bemærk: vi ruller IKKE atomatisk tilbage hvis fx step 2 fejler efter step 1
// har skabt rabatkoden. Hver step er auditeret; manuel oprydning sker via
// audit.revert eller via at slå rabatkoden fra.

const createCampaignInput = z.object({
  // Discount-felter
  discountCode: z
    .string()
    .min(3)
    .transform((s) => s.trim().toUpperCase()),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().positive(),
  validUntil: z.string().datetime().optional(),

  // Branding-felter
  announcement: z.string().min(5).max(200),

  // Preview-mail destination (optional)
  previewEmail: z.string().email().optional(),
});

export const createCampaign = defineTool({
  name: "marketing.create_campaign",
  description:
    "Composite PR demo tool: creates a discount code + updates the announcement bar + writes a preview email in one call. Each sub-step is audited separately so audit.revert can roll them back individually. Use for example 'Create a weekend campaign for Sport -20% code SUMMER20'.",
  scope: "marketing:write",
  input: createCampaignInput,
  examples: [
    {
      name: "Create a summer sale campaign",
      body: {
        discountCode: "SUMMER20",
        discountType: "percent",
        discountValue: 20,
        announcement: "Summer Sale! Use code SUMMER20 for 20% off all orders."
      }
    }
  ],
  handler: async (args, ctx) => {
    // Step 1 — rabatkode
    const discount = await withAudit(
      {
        actor: ctx.actor,
        tool: "marketing.create_campaign:discount",
        args: {
          code: args.discountCode,
          type: args.discountType,
          value: args.discountValue,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      async () => {
        return prisma.discountCode.upsert({
          where: { code: args.discountCode },
          create: {
            code: args.discountCode,
            type: args.discountType,
            value: args.discountValue,
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            active: true,
          },
          update: {
            type: args.discountType,
            value: args.discountValue,
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            active: true,
          },
          select: { id: true, code: true },
        });
      },
    );

    // Step 2 — branding announcement
    const branding = await withAudit(
      {
        actor: ctx.actor,
        tool: "marketing.create_campaign:announcement",
        args: { announcement: args.announcement },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { announcement: true },
          }),
      },
      async () => {
        const existing = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
        });
        if (!existing) throw new Error("BrandingSettings not seeded");

        return prisma.brandingSettings.update({
          where: { id: 1 },
          data: { announcement: args.announcement },
          select: { announcement: true, updatedAt: true },
        });
      },
    );

    // Step 3 — preview-mail (skriver til .mail-previews/, lazy-import for at
    // undgå at lib/mailer.ts loades hvis previewEmail udelades)
    let previewPath: string | null = null;
    if (args.previewEmail) {
      const { writePreviewFile } = await import("@/lib/tools/marketing-helpers");
      previewPath = await writePreviewFile({
        to: args.previewEmail,
        code: args.discountCode,
        type: args.discountType,
        value: args.discountValue,
        announcement: args.announcement,
      });
    }

    return {
      ok: true,
      discount: { id: discount.id, code: discount.code },
      announcement: branding.announcement,
      previewPath,
      summary: `Campaign running: ${args.discountCode} (${args.discountType === "percent" ? `${args.discountValue}%` : `${args.discountValue} ore`}), front page banner: "${args.announcement}"${previewPath ? `, preview sent to ${args.previewEmail}` : ""}.`,
    };
  },
});

export const marketingTools = [createCampaign];
