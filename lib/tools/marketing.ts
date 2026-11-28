import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { ToolRefusal } from "@/lib/tools/refusal";
import { createRefusingDuplicate, DISCOUNT_CODE_MAX, STORED_CODE_CAP } from "@/lib/tools/discounts";
import {
  aboveCap,
  apiKeyDiscountBounds,
  draftNotice,
  overBoundsReason,
  requireUsageLimitAndExpiry,
} from "@/lib/tools/discount-bounds";

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
//
// Den forlænger eller genopliver heller ALDRIG en kode: uden validUntil beholder
// en eksisterende kode sin udløbsdato (før blev den skrevet som null = evig), og
// en eksisterende kode, der er udløbet, afvises før noget skrives.

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
      // Same bound as discounts.create: the refusals below echo the code. It
      // binds on the stored (upper-cased) form, and it also binds on a code that
      // already exists: a code longer than 64 characters made in /admin cannot be
      // re-run as a campaign (the description says so). Exempting it would mean
      // reading and echoing an unbounded string before knowing it exists.
      .max(DISCOUNT_CODE_MAX)
      .transform((s) => s.toUpperCase())
      .refine(...STORED_CODE_CAP),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().int().positive(),
    validUntil: z.string().datetime().optional(),
    // Stored only when given; required from an API key while apiDiscountBounds is on.
    usageLimit: z.number().int().positive().optional(),

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
  // Only when an API key's code is above the apiDiscountBounds caps: the code
  // was created switched off and the banner + preview were left alone.
  notice: z.string().optional(),
});

// A refusal, not a failure: REST answers 409 `discount_code_switched_off` and
// MCP keeps this text, instead of an opaque 500 that invites a retry.
function switchedOff(code: string): ToolRefusal {
  return new ToolRefusal(
    "discount_code_switched_off",
    `Discount code ${code} exists and is switched off. A campaign does not switch it back on: ` +
      `turn it on in /admin/rabatkoder or with discounts.toggle, or choose a new code.`,
  );
}

// A campaign does not revive a code that ran out: the owner's expiry stands.
function expired(code: string): ToolRefusal {
  return new ToolRefusal(
    "discount_code_expired",
    `Discount code ${code} exists and has expired. A campaign does not revive it: ` +
      `choose a new code.`,
  );
}

// Same comparison as checkout (lib/discount.ts): expired once validUntil has passed.
function hasExpired(validUntil: Date | null, now: Date): boolean {
  return validUntil instanceof Date && validUntil.getTime() < now.getTime();
}

// Step 1's write matched no row: the code was switched off, or it expired, after
// step 0 read it. Read it again only to pick the refusal; the message is built
// from the caller's code, never from the row.
async function unmatchedRefusal(code: string, now: Date): Promise<ToolRefusal> {
  const row = await prisma.discountCode.findUnique({
    where: { code },
    select: { active: true, validUntil: true },
  });
  if (!row?.active) return switchedOff(code);
  if (hasExpired(row.validUntil, now)) return expired(code);
  // Live again by now (it appeared, or was switched back on, mid-call): nothing
  // was written, and the caller can simply run the campaign again.
  return new ToolRefusal(
    "discount_code_exists",
    `Discount code ${code} changed while the campaign was being written. Nothing was changed: run it again.`,
  );
}

// The conditional upsert, with the emulated path's "no longer matches" errors
// (P2002 on the INSERT, P2025 on the UPDATE) turned into the refusal. Any other
// error is left alone and stays a 500.
async function upsertLive<T>(code: string, now: Date, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    const prismaCode = (e as { code?: unknown } | null)?.code;
    if (prismaCode === "P2002" || prismaCode === "P2025") throw await unmatchedRefusal(code, now);
    throw e;
  }
}

export const createCampaign = defineTool({
  name: "marketing.create_campaign",
  description:
    "Creates a discount code + updates the announcement bar + writes a preview email in one call. discountType='percent' takes discountValue 1-100; discountType='fixed' takes discountValue in ore. Each step is audited separately, but none can be undone with audit.revert: switch the code off with discounts.toggle and set the banner again with settings.update_branding. An existing code that is switched off or has expired is refused, never switched back on or revived; an active one is updated, and keeps its expiry unless validUntil is given. discountCode is at most 64 characters once upper-cased, also for an existing code: a longer code made in /admin cannot be re-run as a campaign. Use for example 'Create a weekend campaign for Sport -20% code SUMMER20'.",
  scope: "marketing:write",
  // It issues (or updates) a discount code, which discounts.create guards with
  // discounts:write: a marketing-only key must not be a way round that (DRØM134-b).
  extraScopes: ["discounts:write"],
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
      select: { active: true, validUntil: true },
    });
    if (existing && !existing.active) throw switchedOff(args.discountCode);
    if (existing && hasExpired(existing.validUntil, new Date())) {
      throw expired(args.discountCode);
    }

    // Step 0b — an API key's campaign is bounded while apiDiscountBounds is on.
    // Over the value cap or the usageLimit/validUntil ceilings (DRØM133-b) is
    // one rule: a new code is a draft, a live one is not changed.
    const bounds = await apiKeyDiscountBounds(ctx);
    let overCap: string | null = null;
    if (bounds) {
      requireUsageLimitAndExpiry(args);
      overCap = overBoundsReason(
        { type: args.discountType, value: args.discountValue, usageLimit: args.usageLimit, validUntil: args.validUntil },
        bounds,
        new Date(),
      );
    }
    if (overCap && existing) {
      throw aboveCap(
        `Discount code ${args.discountCode} is live and stays as it is: ${overCap}. Nothing was changed.`,
      );
    }
    const usageLimit = args.usageLimit === undefined ? {} : { usageLimit: args.usageLimit };
    const validUntil = args.validUntil ? new Date(args.validUntil) : null;

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
        // Above the cap: a new code is created switched off. A plain create, not
        // the upsert — a row that appeared since step 0 fails on the unique
        // code instead of being re-priced above the cap.
        if (overCap) {
          return createRefusingDuplicate(args.discountCode, () =>
            prisma.discountCode.create({
              data: {
                code: args.discountCode,
                type: args.discountType,
                value: args.discountValue,
                validUntil,
                ...usageLimit,
                active: false,
              },
              select: { id: true, code: true },
            }),
          );
        }
        // `active: true` in the where: if the code is switched off between
        // step 0 and here, the row no longer matches. On Prisma 7 + libSQL the
        // upsert is one native `INSERT … ON CONFLICT (code) DO UPDATE … WHERE
        // active` that then returns NO row (null) instead of throwing — measured
        // on #777 — and an emulated upsert would hit the unique code instead.
        // Either way the code is not revived; the null is turned into the
        // same refusal here, inside step 1, so the banner and preview never run.
        //
        // The expiry is part of the same conditional write, on a clock read
        // here and not in step 0: a code that expires between step 0 and this
        // write no longer matches, so a campaign's own future validUntil cannot
        // revive it (DISCOUNT-FU-NITS). A row with no expiry always matches.
        // The OR makes Prisma emulate the upsert (measured on a real libSQL file,
        // tests/unit/campaign-expiry-race-db.test.ts): a find, then a conditional
        // UPDATE or a plain INSERT. Every write still carries the condition, so a
        // row that stopped matching surfaces as P2002 (the INSERT hit the unique
        // code) or P2025 (the UPDATE matched nothing), and both become the same
        // refusal as the native null.
        const now = new Date();
        const row = await upsertLive(args.discountCode, now, () => prisma.discountCode.upsert({
          where: {
            code: args.discountCode,
            active: true,
            OR: [{ validUntil: null }, { validUntil: { gte: now } }],
          },
          create: {
            code: args.discountCode,
            type: args.discountType,
            value: args.discountValue,
            validUntil,
            ...usageLimit,
            active: true,
          },
          // Like usageLimit, an omitted validUntil leaves the stored one alone:
          // writing null would make a dated code endless, and an expired one
          // redeemable again if it expires between step 0 and here.
          update: {
            type: args.discountType,
            value: args.discountValue,
            ...(validUntil ? { validUntil } : {}),
            ...usageLimit,
          },
          select: { id: true, code: true },
        }));
        if (!row) throw await unmatchedRefusal(args.discountCode, now);
        return row;
      },
    );

    // A draft code is not advertised: no banner, no preview mail.
    if (overCap) {
      const current = await prisma.brandingSettings.findUnique({
        where: { id: 1 },
        select: { announcement: true },
      });
      const notice = `${draftNotice(discount.code, overCap)} The banner and preview mail were not changed.`;
      return {
        ok: true,
        discount: { id: discount.id, code: discount.code },
        announcement: current?.announcement ?? "",
        previewPath: null,
        summary: notice,
        notice,
      };
    }

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
