import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit, listAuditEntries } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { invalidateLayoutCache } from "@/lib/layout";
import { invalidateThemeCache } from "@/lib/theme-cache";
import { invalidateThreeDCache } from "@/lib/three/resolve";
import { invalidateGenomeCache } from "@/lib/genome/store";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

const listInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  toolPrefix: z.string().optional(),
  actorPrefix: z.string().optional(),
  onlyOk: z.boolean().optional(),
  includePayloads: z.boolean().default(false),
});

const revertInput = z.object({
  auditLogId: z.string().min(1),
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

const auditEntryOutput = z.object({
  id: z.string(),
  actor: z.string(),
  tool: z.string(),
  ok: z.boolean(),
  createdAt: z.iso.datetime(),
  errorMsg: z.string().nullable(),
  argsJson: z.string().optional(),
  beforeJson: z.string().nullable().optional(),
  afterJson: z.string().nullable().optional(),
  requestId: z.string().optional(),
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
}).strict();

const auditRevertOutput = z.discriminatedUnion("revertedTool", [
  z.object({
    ok: z.literal(true),
    revertedTool: z.literal("design.set_layout"),
    revertedAuditLogId: z.string(),
    restored: z.object({ layoutJson: z.string().nullable() }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(true),
    revertedTool: z.literal("chrome.set"),
    revertedAuditLogId: z.string(),
    restored: z.object({ chromeJson: z.string().nullable() }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(true),
    revertedTool: z.literal("composition.apply"),
    revertedAuditLogId: z.string(),
    restored: z.object({
      designSlug: z.string().nullable(),
      themeJson: z.string().nullable(),
      chromeJson: z.string().nullable(),
      threeDConfigJson: z.string().nullable(),
      genomeJson: z.string().nullable(),
    }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(true),
    revertedTool: z.literal("products.delete"),
    revertedAuditLogId: z.string(),
    restored: z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
    }).strict(),
  }).strict(),
]);

export const auditList = defineTool({
  name: "audit.list",
  description:
    "List audit entries with pagination + filters (tool prefix, actor prefix, only ok). includePayloads:true also returns args/before/after JSON (larger response).",
  scope: "audit:read",
  input: listInput,
  output: z.array(auditEntryOutput),
  skipAudit: true,
  handler: async (args) => {
    return listAuditEntries(args);
  },
});

// ── audit.revert ────────────────────────────────────────────────────────────
//
// Revert kun for tools markeret `revertible: true` i deres definition.
// Understøttede tools: products.delete (soft-delete reset), design.set_layout
// (gendanner forrige layoutJson), chrome.set (gendanner forrige chromeJson),
// composition.apply (gendanner branding-blobs + genomeJson + homepage-layout —
// best-effort: en Page OPRETTET af apply får layoutJson=null, slettes ikke).
// Andre revertible operationer kommer senere.

const SUPPORTED_REVERTS = [
  "products.delete",
  "design.set_layout",
  "chrome.set",
  "composition.apply",
] as const;

export const auditRevert = defineTool({
  name: "audit.revert",
  description:
    "Roll back a previous destructive operation. Requires audit:revert scope. Only tools marked revertible can be rolled back. Requires confirm: true.",
  scope: "audit:revert",
  input: revertInput,
  output: auditRevertOutput,
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "audit.revert",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.auditLog.findUnique({ where: { id: args.auditLogId } }),
      },
      async () => {
        const entry = await prisma.auditLog.findUnique({
          where: { id: args.auditLogId },
        });
        if (!entry) throw new Error(`Audit entry not found: ${args.auditLogId}`);
        if (!entry.ok) {
          throw new Error("Cannot roll back a failed operation (nothing happened)");
        }
        if (!entry.beforeJson) {
          throw new Error("Audit entry has no before snapshot - not revertible");
        }

        if (!(SUPPORTED_REVERTS as readonly string[]).includes(entry.tool)) {
          throw new Error(
            `Revert of '${entry.tool}' is not implemented. Supported: ${SUPPORTED_REVERTS.join(", ")}`,
          );
        }

        if (entry.tool === "design.set_layout") {
          // before() returnerede en string (forrige layoutJson) eller null;
          // safeStringify har derefter JSON-encoded den ene gang, så JSON.parse
          // giver os den oprindelige værdi tilbage.
          const previousLayoutJson = JSON.parse(entry.beforeJson) as
            | string
            | null;
          await prisma.brandingSettings.upsert({
            where: { id: 1 },
            update: { layoutJson: previousLayoutJson },
            create: {
              ...brandingCreateDefaults(),
              layoutJson: previousLayoutJson,
            },
          });
          invalidateLayoutCache();
          return {
            ok: true,
            revertedTool: entry.tool,
            revertedAuditLogId: entry.id,
            restored: { layoutJson: previousLayoutJson },
          };
        }

        if (entry.tool === "chrome.set") {
          // before() returned the previous chromeJson string (or null),
          // JSON-encoded once by safeStringify — JSON.parse restores it.
          const previousChromeJson = JSON.parse(entry.beforeJson) as string | null;
          await prisma.brandingSettings.upsert({
            where: { id: 1 },
            update: { chromeJson: previousChromeJson },
            create: {
              ...brandingCreateDefaults(),
              chromeJson: previousChromeJson,
            },
          });
          invalidateThemeCache();
          return {
            ok: true,
            revertedTool: entry.tool,
            revertedAuditLogId: entry.id,
            restored: { chromeJson: previousChromeJson },
          };
        }

        if (entry.tool === "composition.apply") {
          // before() returned the full pre-apply snapshot (see
          // lib/compositions/apply.ts): branding blobs + genomeJson +
          // (optionally) the homepage page's previous layoutJson.
          const snapshot = JSON.parse(entry.beforeJson) as {
            branding: {
              designSlug: string | null;
              themeJson: string | null;
              chromeJson: string | null;
              threeDConfigJson: string | null;
            } | null;
            genomeJson: string | null;
            page: { slug: string; layoutJson: string | null } | null;
          };
          const restoredBranding = {
            designSlug: snapshot.branding?.designSlug ?? null,
            themeJson: snapshot.branding?.themeJson ?? null,
            chromeJson: snapshot.branding?.chromeJson ?? null,
            threeDConfigJson: snapshot.branding?.threeDConfigJson ?? null,
            genomeJson: snapshot.genomeJson ?? null,
          };
          await prisma.brandingSettings.upsert({
            where: { id: 1 },
            update: restoredBranding,
            create: {
              ...brandingCreateDefaults(),
              ...restoredBranding,
            },
          });
          // Best-effort homepage restore: only when apply touched a layout. A
          // page CREATED by the apply keeps existing with layoutJson=null
          // (render falls back to body — fail-soft, never deletes content).
          if (snapshot.page) {
            await prisma.page
              .update({
                where: { slug: snapshot.page.slug },
                data: { layoutJson: snapshot.page.layoutJson },
              })
              .catch(() => null);
          }
          invalidateThemeCache();
          invalidateThreeDCache();
          invalidateGenomeCache();
          return {
            ok: true,
            revertedTool: entry.tool,
            revertedAuditLogId: entry.id,
            restored: restoredBranding,
          };
        }

        // products.delete
        const before = JSON.parse(entry.beforeJson) as { id?: string };
        if (!before.id) {
          throw new Error("Before snapshot is missing product ID");
        }

        const restored = await prisma.product.update({
          where: { id: before.id },
          data: { deletedAt: null },
          select: { id: true, slug: true, name: true },
        });

        return {
          ok: true,
          revertedTool: entry.tool,
          revertedAuditLogId: entry.id,
          restored,
        };
      },
    );
  },
});

export const auditTools = [auditList, auditRevert];
