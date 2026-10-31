import "server-only";

import { createClient } from "v0-sdk";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

/**
 * Vercel v0 Platform API client wrapper.
 *
 * OUTBOUND integration: Cartwright calls v0 to generate UI from a prompt. v0
 * emits *code* (React/Tailwind/shadcn); the code→data transform (see
 * lib/v0/transform/*) is what keeps Cartwright's "AI output lives as data,
 * never source files" doctrine intact — this module never writes files to disk.
 *
 * Key resolution mirrors lib/ai/gemini.ts: admin-set DB key (encrypted) has
 * precedence, with V0_API_KEY env as fallback so a deploy can run before the
 * admin wires a key. Verified against v0-sdk 0.16.4.
 */

const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;

// Conservative daily guard — v0's documented ceilings are ~10k req / 1k msgs /
// 100 deploys per day. We stop well under the message ceiling so a runaway loop
// fails cheap (before billing) rather than hammering the API.
const DAILY_MESSAGE_LIMIT = 800;

let cachedV0Key: { value: string | null; expiresAt: number } | null = null;

export class V0ApiError extends Error {
  constructor(
    message = "v0 API request failed",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "V0ApiError";
  }
}

export class V0RateLimit extends Error {
  constructor(message = "v0 rate limit exceeded") {
    super(message);
    this.name = "V0RateLimit";
  }
}

export class V0QuotaExceeded extends Error {
  constructor(message = "v0 daily generation quota reached") {
    super(message);
    this.name = "V0QuotaExceeded";
  }
}

/**
 * Hent v0 Platform API-key. Admin-sat DB-key har forrang, med .env som
 * fallback så deploys kan køre uden at integrere admin-UI først.
 */
export async function getV0ApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedV0Key && cachedV0Key.expiresAt > now) {
    return cachedV0Key.value;
  }

  let dbKey: string | null = null;
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { v0ApiKey: true },
    });
    dbKey = row?.v0ApiKey ? decryptSecret(row.v0ApiKey) : null;
  } catch {
    // DB ikke tilgængelig — falder tilbage til env
  }

  const key = dbKey ?? process.env.V0_API_KEY ?? null;
  cachedV0Key = { value: key, expiresAt: now + CACHE_TTL_MS };
  return key;
}

export function invalidateV0KeyCache(): void {
  cachedV0Key = null;
}

/** A single generated file as returned by a v0 chat version. */
export type V0File = { name: string; content: string };

export type V0GenerationResult = {
  /** Generated source files (TSX/CSS/etc). The transform layer turns these into HTML/section data. */
  files: V0File[];
  /** Link to the v0 chat so the admin can open + iterate visually. */
  webUrl: string;
  /** Live demo URL of the generated version, if v0 produced one. */
  demoUrl: string | null;
  /** Chat id (for future multi-turn refinement / fork). */
  chatId: string;
};

// Minimal structural view of v0-sdk's ChatDetail — the SDK does not export its
// response types, so we narrow to the fields we actually read. Verified against
// v0-sdk 0.16.4 dist/index.d.ts (ChatDetail).
type V0ChatDetail = {
  id: string;
  webUrl: string;
  latestVersion?: {
    status: "pending" | "completed" | "failed";
    demoUrl?: string;
    files?: Array<{ name: string; content: string }>;
  };
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pre-flight daily-usage guard. Reads + increments IntegrationSettings.v0UsageJson
 * so a runaway loop fails cheap before hitting v0's billed daily ceiling.
 * Throws V0QuotaExceeded when the day's message budget is spent.
 */
async function consumeDailyQuota(): Promise<void> {
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { v0UsageJson: true },
  });

  let usage: { date: string; messages: number } = { date: today(), messages: 0 };
  if (row?.v0UsageJson) {
    try {
      const parsed = JSON.parse(row.v0UsageJson) as Partial<{
        date: string;
        messages: number;
      }>;
      if (parsed.date === today() && typeof parsed.messages === "number") {
        usage = { date: today(), messages: parsed.messages };
      }
    } catch {
      // korrupt JSON → behandl som frisk dag
    }
  }

  if (usage.messages >= DAILY_MESSAGE_LIMIT) {
    throw new V0QuotaExceeded(
      `v0 daily generation budget reached (${DAILY_MESSAGE_LIMIT}/day). Try again tomorrow or raise the limit.`,
    );
  }

  const next = { date: today(), messages: usage.messages + 1 };
  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    create: { id: 1, v0UsageJson: JSON.stringify(next) },
    update: { v0UsageJson: JSON.stringify(next) },
  });
}

/**
 * Generate a UI section via v0. Returns the raw generated files plus the chat
 * web URL and demo URL. Always uses sync responseMode + private chat (admin
 * generation should never be world-listed). The caller runs the files through
 * lib/v0/transform/* to get doctrine-compliant HTML/section data.
 */
export async function generateV0Section(args: {
  message: string;
  system?: string;
  designSystemId?: string | null;
  mcpServerIds?: string[];
}): Promise<V0GenerationResult> {
  const apiKey = await getV0ApiKey();
  if (!apiKey) {
    throw new V0ApiError(
      "No v0 API key - set one in /admin/integrations or via V0_API_KEY in .env",
    );
  }

  await consumeDailyQuota();

  const client = createClient({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const created = (await client.chats.create({
      message: args.message,
      system: args.system,
      chatPrivacy: "private",
      responseMode: "sync",
      ...(args.designSystemId ? { designSystemId: args.designSystemId } : {}),
      ...(args.mcpServerIds?.length ? { mcpServerIds: args.mcpServerIds } : {}),
    })) as unknown as V0ChatDetail;

    let detail = created;

    // Sync mode normally returns a completed version, but guard against a
    // still-pending version by polling getById a few times before giving up.
    for (let attempt = 0; attempt < 4; attempt++) {
      const files = detail.latestVersion?.files;
      if (detail.latestVersion?.status === "completed" && files?.length) break;
      if (detail.latestVersion?.status === "failed") {
        throw new V0ApiError("v0 generation failed");
      }
      await new Promise((r) => setTimeout(r, 1500));
      detail = (await client.chats.getById({
        chatId: detail.id,
      })) as unknown as V0ChatDetail;
    }

    const files = (detail.latestVersion?.files ?? []).map((f) => ({
      name: f.name,
      content: f.content,
    }));

    if (!files.length) {
      throw new V0ApiError("v0 returned no generated files");
    }

    return {
      files,
      webUrl: detail.webUrl,
      demoUrl: detail.latestVersion?.demoUrl ?? null,
      chatId: detail.id,
    };
  } catch (error) {
    if (
      error instanceof V0ApiError ||
      error instanceof V0RateLimit ||
      error instanceof V0QuotaExceeded
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new V0ApiError("v0 API request timed out");
    }
    // v0-sdk throws on HTTP errors; surface a sanitized message + best-effort status.
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status) || undefined
        : undefined;
    if (status === 429) throw new V0RateLimit();
    console.error("[v0] generation error:", error);
    throw new V0ApiError(
      error instanceof Error ? error.message : "v0 API request failed",
      status,
    );
  } finally {
    clearTimeout(timeout);
  }
}
