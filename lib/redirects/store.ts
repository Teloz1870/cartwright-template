import "server-only";

import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { LOCALE_RE, normalizeFromPath, relativePathOf, stripLocaleAndQuery, type RedirectMap } from "./match";

/**
 * Redirect-store: prisma-CRUD + sync til Redis (det proxy.ts læser). Hvis Redis
 * ikke er konfigureret, no-op'er sync'en (redirects virker så ikke på edge — det
 * dokumenteres). Hver mutation re-synker hele mappet.
 */

export const REDIRECTS_REDIS_KEY = "cartwright_redirects";

function redisClient(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Redis.fromEnv();
  }
  return null;
}

export async function buildRedirectMap(): Promise<RedirectMap> {
  const rows = await prisma.redirect.findMany();
  const map: RedirectMap = {};
  for (const r of rows) map[r.fromPath] = { to: r.toPath, status: r.statusCode };
  return map;
}

export async function syncRedirectsToRedis(): Promise<boolean> {
  const r = redisClient();
  if (!r) return false;
  const map = await buildRedirectMap();
  await r.set(REDIRECTS_REDIS_KEY, JSON.stringify(map));
  return true;
}

export async function listRedirects() {
  return prisma.redirect.findMany({ orderBy: { createdAt: "desc" } });
}

export type RedirectResult = { ok: true } | { ok: false; error: string };

/**
 * The rules ONE redirect must pass — shared with the CSV planner (./import.ts)
 * so the two never disagree. A relative destination is judged as the matcher
 * will see it (`stripLocaleAndQuery`): `/kontakt → /da/kontakt` would loop
 * into `/da/da/kontakt` because the second request matches `/kontakt` again,
 * and `/page → /page/` or `/page → /page?x=1` is the same page twice.
 */
export function redirectInputError(fromPath: string, toPath: string): string | null {
  if (fromPath.length < 2) return "A source path is required.";
  if (/^https?:\/\//i.test(toPath)) return null;
  if (!toPath.startsWith("/")) return "The destination must start with / or http(s)://";
  if (LOCALE_RE.test(relativePathOf(toPath))) {
    return "Write the destination without the /da or /en prefix — the redirect keeps the reader's locale.";
  }
  if (fromPath === stripLocaleAndQuery(toPath)) return "Source and destination must not be the same.";
  return null;
}

export async function createRedirect(
  fromRaw: string,
  toRaw: string,
  statusCode: number,
  actor: AuditActor,
): Promise<RedirectResult> {
  const fromPath = normalizeFromPath(fromRaw);
  const toPath = toRaw.trim();
  const error = redirectInputError(fromPath, toPath);
  if (error) return { ok: false, error };
  const status = statusCode === 302 ? 302 : 301;

  try {
    await withAudit(
      { actor, tool: "redirects.create", args: { fromPath, toPath, status } },
      async () => {
        await prisma.redirect.upsert({
          where: { fromPath },
          update: { toPath, statusCode: status },
          create: { fromPath, toPath, statusCode: status },
        });
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  await syncRedirectsToRedis();
  return { ok: true };
}

export async function deleteRedirect(id: string, actor: AuditActor): Promise<RedirectResult> {
  try {
    await withAudit({ actor, tool: "redirects.delete", args: { id } }, async () => {
      await prisma.redirect.delete({ where: { id } });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete." };
  }
  await syncRedirectsToRedis();
  return { ok: true };
}
