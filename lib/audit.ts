import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAuditContext } from "@/lib/audit-context";

/**
 * Audit-actor som typed prefix-string. Læses og parses i /changelog.
 *
 *   apikey:<id>             — ekstern AI-klient (Claude Desktop, etc.)
 *   user:<id>               — admin via web-UI (Auth.js session)
 *   storefront-chat:<sid>   — kunde-chat på storefront
 *   storefront-voice:<sid>  — kunde-voice-session (Gemini Live)
 *   system:<task>           — baggrund-jobs (embedding-rebuild, seed)
 */
export type AuditActor =
  | `apikey:${string}`             // ekstern AI/REST-klient
  | `user:${string}`               // admin via web-UI server actions
  | `storefront-chat:${string}`    // kunde-chat på storefront
  | `storefront-voice:${string}`   // kunde-voice-session (Gemini Live)
  | `operator-chat:${string}`      // admin-chat i /admin/ai (skelnes fra user: så /admin/audit kan filtrere)
  | `system:${string}`;            // baggrund-jobs

export type AuditMeta = {
  actor: AuditActor;
  /** fx "products.create" — matcher tool-navn 1:1 */
  tool: string;
  /** Input-argumenter til tool-kaldet. Saniteres for følsomme felter. */
  args: unknown;
  /**
   * Optional: før-tilstand for destruktive operationer. Hvis denne returnerer
   * et objekt der ikke kan JSON-stringifies, logges en placeholder.
   */
  before?: () => Promise<unknown> | unknown;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Wrapper omkring en handler-funktion. Logger ind hver kald (ok eller fejl)
 * til AuditLog-tabellen. Returnerer handler-resultatet uforandret eller
 * rethrower fejlen.
 *
 * **Brug:** alle `lib/tools/*` skriveoperationer wrappes; læsning skal ikke
 * auditeres (for støj).
 *
 *   return withAudit(
 *     { actor, tool: "products.create", args, before: () => null },
 *     () => prisma.product.create({ data: args }),
 *   );
 */
export async function withAudit<T>(
  meta: AuditMeta,
  handler: () => Promise<T>,
): Promise<T> {
  const requestId = meta.requestId ?? randomUUID();
  const beforeJson = await captureBefore(meta.before);
  const argsJson = safeStringify(redactSensitive(meta.args));

  try {
    const result = await handler();
    await writeAuditEntry({
      actor: meta.actor,
      tool: meta.tool,
      argsJson,
      beforeJson,
      afterJson: safeStringify(result),
      ok: true,
      errorMsg: null,
      requestId,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return result;
  } catch (err) {
    await writeAuditEntry({
      actor: meta.actor,
      tool: meta.tool,
      argsJson,
      beforeJson,
      afterJson: null,
      ok: false,
      errorMsg: err instanceof Error ? err.message : String(err),
      requestId,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    throw err;
  }
}

async function captureBefore(
  before: AuditMeta["before"],
): Promise<string | null> {
  if (!before) return null;
  try {
    const snapshot = await before();
    return safeStringify(snapshot);
  } catch {
    return JSON.stringify({ __beforeCaptureFailed: true });
  }
}

/**
 * JSON.stringify uden at kaste på circular references.
 * Trunkerer meget store payloads så audit-tabellen ikke vokser ekspleksivt.
 */
const MAX_JSON_BYTES = 64 * 1024; // 64 KB pr. felt
function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(value, (_k, v) => {
      if (v && typeof v === "object") {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      return v;
    });
    if (!json) return "null";
    return json.length > MAX_JSON_BYTES
      ? json.slice(0, MAX_JSON_BYTES) + '..."[truncated]"'
      : json;
  } catch (err) {
    return JSON.stringify({
      __stringifyFailed: true,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fjerner følsomme felter før de skrives til audit-log.
 *
 * Bruger pattern-baseret matching i stedet for fast keyset:
 * - Case-insensitive
 * - Substring-baseret så `anthropicApiKey`, `accessToken`, `authToken` etc.
 *   alle dækkes uden manuelt vedligehold
 * - Kortvarige PII (CVC, cardNumber) eksplicit
 *
 * Eksporteret så route-handlers kan bruge den på rejection-paths (review
 * fund #4: customer-chat loggede tidligere args uredacted ved allowlist-fejl).
 */
const SENSITIVE_REGEX = /password|passwd|secret|token|api[_-]?key|apikey|bearer|authorization|webhook[_-]?secret|encryption[_-]?key|private[_-]?key|cvc|cvv|cardnumber|face|portrait|selfie|userimage|userphoto|imagebytes|facebytes|facepng|facejpeg/i;

export function redactSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_REGEX.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSensitive(v);
    }
  }
  return out;
}

type AuditEntry = {
  actor: AuditActor;
  tool: string;
  argsJson: string;
  beforeJson: string | null;
  afterJson: string | null;
  ok: boolean;
  errorMsg: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

async function writeAuditEntry(entry: AuditEntry): Promise<void> {
  // Audit-skrivning må aldrig fejle hele requesten. Hvis DB er nede er det
  // sandsynligvis et større problem, men handler-resultatet er stadig
  // værdifuldt for brugeren. Vi logger fejlen til console.
  //
  // Local-AI plan: stamps også provider/model/modality fra AsyncLocalStorage
  // context hvis sat. Default modality="text" — kun voice-flowet sætter "voice".
  const ctx = getAuditContext();
  try {
    await prisma.auditLog.create({
      data: {
        ...entry,
        provider: ctx?.provider ?? null,
        model: ctx?.model ?? null,
        modality: ctx?.modality ?? "text",
        sessionMinutes: ctx?.sessionMinutes ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit entry:", err, entry);
  }
}

/**
 * Læs audit-entries for /changelog og /admin/audit. Filtrer args/before/after
 * fra hvis caller ikke har audit:read scope.
 */
export type AuditListOptions = {
  limit?: number;
  cursor?: string;
  toolPrefix?: string;
  actorPrefix?: string;
  onlyOk?: boolean;
  includePayloads?: boolean;
};

export async function listAuditEntries(options: AuditListOptions = {}) {
  const {
    limit = 50,
    cursor,
    toolPrefix,
    actorPrefix,
    onlyOk,
    includePayloads = false,
  } = options;

  const where: Record<string, unknown> = {};
  if (toolPrefix) where.tool = { startsWith: toolPrefix };
  if (actorPrefix) where.actor = { startsWith: actorPrefix };
  if (onlyOk !== undefined) where.ok = onlyOk;

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      actor: true,
      tool: true,
      ok: true,
      createdAt: true,
      errorMsg: true,
      ...(includePayloads
        ? { argsJson: true, beforeJson: true, afterJson: true, requestId: true, ip: true, userAgent: true }
        : {}),
    },
  });

  return entries;
}
