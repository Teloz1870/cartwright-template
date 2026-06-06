import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit, listAuditEntries } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { invalidateLayoutCache } from "@/lib/layout";

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

export const auditList = defineTool({
  name: "audit.list",
  description:
    "List audit entries with pagination + filters (tool prefix, actor prefix, only ok). includePayloads:true also returns args/before/after JSON (larger response).",
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
// Understøttede tools: products.delete (soft-delete reset), design.set_layout
// (gendanner forrige layoutJson). Andre revertible operationer kommer senere.

const SUPPORTED_REVERTS = ["products.delete", "design.set_layout"] as const;

export const auditRevert = defineTool({
  name: "audit.revert",
  description:
    "Roll back a previous destructive operation. Requires audit:revert scope. Only tools marked revertible can be rolled back. Requires confirm: true.",
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
              id: 1,
              storeName: "Cartwright",
              heroImage: "",
              announcement: "",
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
