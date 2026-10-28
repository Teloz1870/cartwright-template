import { Redis } from "@upstash/redis";
import type { RedirectMap } from "./match";

/**
 * RED1 — the redirect map the proxy matches against: `Redis ?? DB`.
 *
 * With `UPSTASH_REDIS_REST_*` set the map is read from Redis, exactly as
 * before (`lib/redirects/store.ts` writes it there on every change). Without
 * Redis — the default scaffold — it is read from the `Redirect` table, so a
 * redirect saved in `/admin/redirects` (or imported from CSV) answers live
 * instead of being stored and never served.
 *
 * The answer is cached for 60 s per server instance, so it costs one read a
 * minute, not one per request. Nothing is built at import: the Redis client and
 * the database module are reached only inside the getter, and any failure
 * (no Redis value, the database unreachable) degrades to an empty map — no
 * redirect, the request falls through as if none were configured.
 *
 * NO `server-only` here: proxy.ts imports this module.
 */

export const REDIRECTS_REDIS_KEY = "cartwright_redirects";

const TTL_MS = 60_000;

let cache: { map: RedirectMap; expires: number } | null = null;
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  redisClient =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? Redis.fromEnv()
      : null;
  return redisClient;
}

async function readFromRedis(redis: Redis): Promise<RedirectMap> {
  const raw = await redis.get(REDIRECTS_REDIS_KEY);
  if (!raw) return {};
  return typeof raw === "string" ? (JSON.parse(raw) as RedirectMap) : (raw as RedirectMap);
}

async function readFromDatabase(): Promise<RedirectMap> {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.redirect.findMany({
    select: { fromPath: true, toPath: true, statusCode: true },
  });
  const map: RedirectMap = {};
  for (const r of rows) map[r.fromPath] = { to: r.toPath, status: r.statusCode };
  return map;
}

/** The map the proxy matches against; cached for 60 s, `{}` on any failure. */
export async function loadRedirectMap(): Promise<RedirectMap> {
  if (cache && cache.expires > Date.now()) return cache.map;
  let map: RedirectMap = {};
  try {
    const redis = getRedis();
    map = redis ? await readFromRedis(redis) : await readFromDatabase();
  } catch (e) {
    console.warn("[Proxy] redirect map load failed:", e);
  }
  cache = { map, expires: Date.now() + TTL_MS };
  return map;
}

/**
 * Drop the cached map so the next request reads it again. Reaches only the
 * server instance it runs in — another instance (or a separately bundled
 * proxy) picks a change up when its own 60 s run out.
 */
export function bustRedirectMap(): void {
  cache = null;
}
