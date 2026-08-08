import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { exportUserData } from "@/lib/gdpr/export";
import { anonymizeCustomer } from "@/lib/gdpr/erase";

/**
 * Admin AI tools for GDPR data-subject requests. gdpr.export_user assembles a
 * full export for a customer (art. 15/20). skipAudit: the result IS the
 * customer's PII — we don't want it copied into the audit afterJson; the
 * invocation itself is admin-gated via the customer:read scope.
 */
export const exportUserTool = defineTool({
  name: "gdpr.export_user",
  description:
    "Export all stored data for one customer (GDPR data-subject access request): profile, orders, guest orders on the same email, reviews, subscriptions, carts, leads, and ACP checkout sessions. Read-only. Provide the userId.",
  scope: "customer:read",
  input: z.object({ userId: z.string().min(1) }),
  skipAudit: true,
  handler: async (args) => {
    const data = await exportUserData(args.userId);
    if (!data) throw new Error(`Ingen bruger med id '${args.userId}'.`);
    return data;
  },
});

export const eraseUserTool = defineTool({
  name: "gdpr.erase_user",
  description:
    "Soft-erase (anonymize) a customer for a GDPR right-to-erasure request. Anonymizes PII on the user, their orders (KEEPS amounts + payment refs for bookkeeping), and reviews; deletes leads + ACP sessions; revokes API keys; clears audit IPs. NOT reversible. Logs a DataErasureRequest. Provide the userId and confirm: true.",
  scope: "settings:write",
  input: z.object({
    userId: z.string().min(1),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  handler: async (args, ctx) => {
    const result = await anonymizeCustomer(args.userId, ctx.actor);
    if (!result.ok) throw new Error(result.error);
    return result;
  },
});

export const gdprTools = [exportUserTool, eraseUserTool];
