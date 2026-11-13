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
// trin på én gang. Hvert sub-step skrives separat til audit-loggen — men
// INGEN af dem kan rulles tilbage med audit.revert (de står ikke i
// SUPPORTED_REVERTS, lib/tools/audit.ts). Oprydning er manuel: slå koden fra
// (discounts.toggle / /admin/rabatkoder) og sæt banneret igen
// (settings.update_branding).
//
// Bemærk: vi ruller IKKE atomatisk tilbage hvis fx step 2 fejler efter step 1
// har skabt rabatkoden.
//
// En kampagne tænder ALDRIG en kode, som ejeren har slået fra (DRØM134-a):
// `marketing:write` alene må ikke kunne genoplive en slukket rabat. Findes
// koden og er den slukket, afvises kaldet før noget skrives; findes den og er
// den aktiv, opdateres den som før ("kør kampagnen igen").

const createCampaignInput = z
  .object({
    // Discount-felter
    discountCode: z
      .string()
      // `.trim()` BEFORE `.min(3)` — same reason as lib/tools/discounts.ts: a
      // trailing trim would measure the padding. It matters more here because the
      // code does not stop at the DB: when `previewEmail` is supplied, step 3
      // renders it as the campaign's headline code (marketing-helpers.ts:46), so
      // an under-length code propagates into campaign material as a valid one.
      .trim()
      .min(3)
      .transform((s) => s.toUpperCase()),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().int().positive(),
    validUntil: z.string().datetime().optional(),

    // Branding-felter
    announcement: z.string().min(5).max(200),

    // Preview-mail destination (optional)
    previewEmail: z.string().email().optional(),
  })
  // Same ceiling as discounts.create: a percent campaign above 100 % would
  // otherwise be stored and clamped to the subtotal at checkout (free goods).
  .refine(
    (d) => d.discountType !== "percent" || d.discountValue <= 100,
    "Percentage discount cannot exceed 100",
  );

const createCampaignOutput = z.strictObject({
  ok: z.literal(true),
  discount: z.strictObject({
    id: z.string(),
    code: z.string(),
  }),
  announcement: z.string(),
  previewPath: z.string().nullable(),
  summary: z.string(),
});

function switchedOff(code: string): Error {
  return new Error(
    `Discount code ${code} exists and is switched off. A campaign does not switch it back on: ` +
      `turn it on in /admin/rabatkoder or with discounts.toggle, or choose a new code.`,
  );
}

export const createCampaign = defineTool({
  name: "marketing.create_campaign",
  description:
    "Creates a discount code + updates the announcement bar + writes a preview email in one call. discountType='percent' takes discountValue 1-100; discountType='fixed' takes discountValue in ore. Each step is audited separately, but none can be undone with audit.revert: switch the code off with discounts.toggle and set the banner again with settings.update_branding. An existing code that is switched off is refused, never switched back on; an active one is updated. Use for example 'Create a weekend campaign for Sport -20% code SUMMER20'.",
  scope: "marketing:write",
  gate: { ecommerce: true },
  input: createCampaignInput,
  output: createCampaignOutput,
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
    // Step 0 — a code the owner switched off stays off. Checked before any
    // write, so a refused campaign leaves no audit row, banner or preview.
    const existing = await prisma.discountCode.findUnique({
      where: { code: args.discountCode },
      select: { active: true },
    });
    if (existing && !existing.active) throw switchedOff(args.discountCode);

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
        // `active: true` in the where: if the code is switched off between
        // step 0 and here, the row no longer matches. On Prisma 7 + libSQL the
        // upsert is one native `INSERT … ON CONFLICT (code) DO UPDATE … WHERE
        // active` that then returns NO row (null) instead of throwing — measured
        // on #777 — and an emulated upsert would hit the unique code instead.
        // Either way the code is not revived; the null is turned into the
        // same refusal here, inside step 1, so the banner and preview never run.
        const row = await prisma.discountCode.upsert({
          where: { code: args.discountCode, active: true },
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
          },
          select: { id: true, code: true },
        });
        if (!row) throw switchedOff(args.discountCode);
        return row;
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
