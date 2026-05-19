import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit, listAuditEntries } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

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
  confirm: z.literal(true, { error: "Kræver confirm: true" }),
});

export const auditList = defineTool({
  name: "audit.list",
  description:
    "List audit-entries med pagination + filtre (tool-prefix, actor-prefix, only-ok). includePayloads:true returnerer også args/before/after-JSON (større respons).",
  scope: "audit:read",
  input: listInput,
  skipAudit: true,
  handler: async (args) => {
    return listAuditEntries(args);
  },
});

// ── audit.revert ────────────────────────────────────────────────────────────
//
// Revert kun for tools markeret `revertible: true` i deres definition.
// I Fase 0 understøtter vi soft-delete-revert af produkter (sætter
// deletedAt = null). Andre revertible operationer kommer i Fase 2.

export const auditRevert = defineTool({
  name: "audit.revert",
  description:
    "Rul en tidligere destruktiv operation tilbage. Kræver audit:revert scope. Kun tools markeret revertible kan rulles tilbage. Kræver confirm: true.",
  scope: "audit:revert",
  input: revertInput,
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
        if (!entry) throw new Error(`Audit-entry ikke fundet: ${args.auditLogId}`);
        if (!entry.ok) {
          throw new Error("Kan ikke rulle en fejlet operation tilbage (intet sket)");
        }
        if (!entry.beforeJson) {
          throw new Error("Audit-entry har ingen before-snapshot — ikke revertible");
        }

        // V1 understøtter kun products.delete-revert
        if (entry.tool !== "products.delete") {
          throw new Error(
            `Revert af '${entry.tool}' er ikke implementeret i v1. Understøttede: products.delete`,
          );
        }

        const before = JSON.parse(entry.beforeJson) as { id?: string };
        if (!before.id) {
          throw new Error("Before-snapshot mangler produkt-id");
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
