import "server-only";

import { randomUUID } from "node:crypto";
import {
  ADMIN_MAX_TOOL_CALLS_PER_SESSION,
  ADMIN_TOOL_ALLOWLIST,
  isAdminTool,
  needsConfirmation,
  type ToolTier,
} from "@/lib/ai/client";
import { invokeTool } from "@/lib/tools/registry";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import { prisma } from "@/lib/db";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
} from "@/lib/confirmation-tokens";
import { redactSensitive } from "@/lib/audit";
import { orderStatusPlanPreview } from "@/lib/orders/status";

/**
 * The API-safe name the model sees ("products_delete") → the registry name, for
 * EVERY allowlisted tool, not only the offered ones: a call outside the tier is
 * still named by its registry name in the audit row. No two allowlisted names
 * collapse to the same API name.
 */
const ADMIN_TOOL_BY_API_NAME: ReadonlyMap<string, string> = new Map(
  ADMIN_TOOL_ALLOWLIST.map((name) => [name.replace(/\./g, "_"), name]),
);

function parseToolInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

/**
 * The operator chat's tool executor (`/api/admin/chat`), one per request.
 *
 * `offered` is the set the model was handed: its capability tier applied to
 * ADMIN_TOOL_ALLOWLIST (`filterToolsForCapability`). The AI SDK only runs a
 * tool that is in that table: a call to any other name fails in the SDK with
 * NoSuchToolError before any `execute`, so it never reaches executeAdminTool.
 * `refuseUnofferedCall` (wired to the route's `repairToolCall`) is how such a
 * call to an admin tool outside the tier is still refused on the record. The
 * tier check inside executeAdminTool is the backstop for a call that does reach
 * it: no plan card, no token, no handler.
 */
export type AdminToolExecutorOptions = {
  offered: readonly string[];
  tier: ToolTier;
  adminUserId: string;
  suggestMode?: boolean;
  /** Map af tool → confirmation-token, sendt fra klient når admin har klikket
   *  bekræft på et plan-card. Server slår op i pending-map for at validere. */
  confirmations?: Record<string, string>;
  ip: string | null;
  userAgent: string | null;
};

export function createAdminToolExecutor(opts: AdminToolExecutorOptions) {
  const { adminUserId, suggestMode, confirmations, ip, userAgent } = opts;
  const offered: ReadonlySet<string> = new Set(opts.offered);
  const actor = `operator-chat:${adminUserId}` as const;
  let toolCallCount = 0;

  async function refuse(name: string, args: unknown, errorMsg: string) {
    await prisma.auditLog.create({
      data: {
        actor,
        tool: name,
        argsJson: JSON.stringify(redactSensitive(args)),
        ok: false,
        errorMsg,
        requestId: randomUUID(),
        ip,
        userAgent,
      },
    });
  }

  async function refuseOutsideTier(name: string, args: unknown): Promise<{ error: string }> {
    await refuse(name, args, `Tool is outside the model's capability tier (${opts.tier})`);
    return {
      error: `${name} is not available to this model: its capability tier is ${opts.tier}. Pick a model with a larger tier in /admin/integrations to use it.`,
    };
  }

  /**
   * A tool call the AI SDK could not match to the offered table — the route's
   * `repairToolCall` hands it over on NoSuchToolError. For an allowlisted tool
   * outside the tier it writes the same refusal row as executeAdminTool and
   * returns the error text for the model. For any other name (no admin tool,
   * or one that IS offered) it returns null and the SDK's own error stands. It
   * never runs a tool.
   */
  async function refuseUnofferedCall(apiName: string, input: string): Promise<string | null> {
    const name = ADMIN_TOOL_BY_API_NAME.get(apiName) ?? (isAdminTool(apiName) ? apiName : undefined);
    if (name === undefined || offered.has(name)) return null;
    return (await refuseOutsideTier(name, parseToolInput(input))).error;
  }

  async function executeAdminTool(
    name: string,
    args: unknown,
  ): Promise<unknown> {
    // Budget-loft
    if (toolCallCount >= ADMIN_MAX_TOOL_CALLS_PER_SESSION) {
      return {
        error:
          "Tool-budget brugt op for denne session. Refresh siden for at starte forfra.",
      };
    }
    toolCallCount++;

    // Defense-in-depth: bekræft tool er på allowlist
    if (!isAdminTool(name)) {
      await refuse(name, args, "Operator chat tried to call a disallowed tool");
      return { error: "That tool is not available to operator chat." };
    }

    // The model's capability tier: only the tools it was offered run.
    if (!offered.has(name)) {
      return refuseOutsideTier(name, args);
    }

    // Suggest-mode: bloker alle write-tools (CONFIRM_REQUIRED = vores write-set;
    // a read-shaped call of one — a dry run — is not a write, see READ_ONLY_WHEN)
    const gated = needsConfirmation(name, args);
    if (suggestMode && gated) {
      return {
        error:
          "Suggest mode is active - write tools are disabled. Turn off suggest mode to execute the action.",
      };
    }

    // Plan-først: write-tools kræver server-state-baseret confirmation-token.
    // AI'en kan ALDRIG generere et gyldigt token selv — det udstedes af
    // serveren, gemmes i memory-map med (tool, argsHash, adminId, expiry),
    // og kan kun konsumeres af klienten via request-body 'confirmations'-map
    // efter at admin har klikket Bekræft på plan-card.
    if (gated) {
      // Strip eventuel AI-genereret 'confirm:true' fra args så den ikke kan
      // overleve consumeConfirmation's hash-tjek (vi compare'r mod args UDEN
      // confirm-felt for at få deterministisk hash uanset AI's adfærd).
      const cleanArgs = stripConfirm(args);

      // Tjek om klienten har sendt et token for dette tool
      const token = confirmations?.[name];

      if (!token) {
        // INGEN token: returnér plan-card med nyt token → klienten viser
        // bekræft-knap → ved klik sender klient request igen med token
        const newToken = createPendingConfirmation({
          tool: name,
          toolArgs: cleanArgs,
          ownerId: adminUserId,
        });
        return {
          requiresConfirmation: true,
          tool: name,
          args: cleanArgs,
          preview: buildPlanPreview(name, cleanArgs),
          confirmationToken: newToken,
        };
      }

      // Token sendt: verificér + consume
      const verify = consumeConfirmation({
        token,
        tool: name,
        toolArgs: cleanArgs,
        ownerId: adminUserId,
      });
      if (!verify.ok) {
        return { error: `Confirmation rejected: ${verify.reason}` };
      }
      // Verified → tilføj confirm:true til args. Tools' Zod-schema kræver
      // dette flag for at beskytte MCP/REST-konsumenter; her ER det
      // legitimt at sætte det fordi vi lige har konsumeret et token.
      args = { ...(cleanArgs as Record<string, unknown>), confirm: true };
    }

    const result = await invokeTool(
      name,
      args,
      { actor, requestId: randomUUID(), ip, userAgent },
      ADMIN_CHAT_SCOPES,
    );
    return result.ok ? result.result : { error: result.error };
  }

  return Object.assign(executeAdminTool, { refuseUnofferedCall });
}

/**
 * Menneske-læseligt resume af et tool-kald til plan-card-rendering.
 * Skal være ÉN linje — admin scanner planen hurtigt før klik.
 */
function buildPlanPreview(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case "products.delete":
      return `Slet (soft-delete) produktet '${a.slug}'`;
    case "products.create":
      return `Opret produkt '${a.name}' (slug: ${a.slug}) til ${formatPrice(a.priceDkk)}`;
    case "products.update":
      return `Update product '${a.slug}' with changes: ${JSON.stringify(a.patch ?? {})}`;
    case "orders.update_status":
      return orderStatusPlanPreview(a.orderId, a.status, a.refundDkk);
    case "discounts.create":
      return `Opret rabatkode '${a.code}' (${a.type === "percent" ? `${a.value}%` : `${formatPrice(a.value)}`})`;
    case "discounts.toggle":
      return `Toggle rabatkode '${a.code}' aktiv/inaktiv`;
    case "categories.upsert":
      return `Opret/opdater kategori '${a.slug}' ('${a.name}')`;
    case "categories.delete":
      return `Slet kategori '${a.slug}'`;
    case "pages.upsert":
      return `Opret/opdater /info/${a.slug} ('${a.title}')`;
    case "pages.delete":
      return `Slet side /info/${a.slug}`;
    case "docs.import":
      return `Importér Google Doc som ${a.target === "post" ? "blogindlæg" : "side"}`;
    case "settings.update_shipping":
      return `Set shipping: ${formatPrice(a.shippingFeeOere)} | free above ${formatPrice(a.freeShippingThresholdOere)}`;
    case "settings.update_branding":
      return `Opdater branding (butiksnavn '${a.storeName}', announcement '${a.announcement}')`;
    case "marketing.create_campaign":
      return `KAMPAGNE: rabatkode '${a.discountCode}' (${a.discountType === "percent" ? `${a.discountValue}%` : `${formatPrice(a.discountValue)}`}) + nyt banner '${a.announcement}'`;
    case "audit.revert":
      return `RUL TILBAGE audit-entry ${a.auditLogId}`;
    case "redirects.import":
      return `Import redirects from CSV (${String(a.csv ?? "").split(/\r?\n/).filter((l) => l.trim()).length} lines) — chains, loops and duplicates are refused; preview first with dryRun: true`;
    case "migration.project_set":
      return `Migration project: source ${a.sourceUrl ?? "unchanged"}, new site ${a.targetUrl === null ? "none" : (a.targetUrl ?? "unchanged")} — a new source drops the frozen URL map`;
    case "migration.freeze_sitemap":
      return `Freeze the old site's URL list from ${a.sitemapUrl ?? "its sitemap"} — replaces the frozen URL map; preview first with dryRun: true`;
    case "migration.attest":
      return `Sign off ${a.checkId} as ${a.status}: "${a.note}"${a.checkId === "cutover.switched" && a.status === "pass" ? " — records the DNS switch time" : ""}`;
    default:
      return `Run ${name}`;
  }
}

function formatPrice(v: unknown): string {
  if (typeof v !== "number") return String(v);
  return `${(v / 100).toFixed(2).replace(".", ",")} kr`;
}
