"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { listAuditEntries } from "@/lib/audit";
import { invokeTool } from "@/lib/tools/registry";
import { SCOPES, type Scope } from "@/lib/scopes";

export type AuditFilter = {
  toolPrefix?: string;
  actorPrefix?: string;
  onlyOk?: boolean;
  limit?: number;
};

export async function fetchAuditEntries(filter: AuditFilter = {}) {
  await requireAdmin();
  return listAuditEntries({
    limit: filter.limit ?? 100,
    toolPrefix: filter.toolPrefix || undefined,
    actorPrefix: filter.actorPrefix || undefined,
    onlyOk: filter.onlyOk,
    includePayloads: true,
  });
}

/**
 * Rul en tidligere destruktiv operation tilbage. Vi bruger audit.revert-tool'et
 * via det interne registry (samme sti som MCP/REST) så audit-skrivning af
 * selve revert-aktionen sker automatisk.
 */
export async function revertAuditEntryAction(
  auditLogId: string,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const session = await requireAdmin();

  const result = await invokeTool(
    "audit.revert",
    { auditLogId, confirm: true },
    {
      actor: `user:${session.user.id}`,
      requestId: randomUUID(),
    },
    SCOPES as readonly Scope[],
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/audit");
  revalidatePath("/changelog");
  return {
    ok: true,
    summary:
      typeof result.result === "object" && result.result && "restored" in result.result
        ? `Gendannet: ${(result.result as { restored: { slug: string; name: string } }).restored.name}`
        : "Rulning udført",
  };
}
