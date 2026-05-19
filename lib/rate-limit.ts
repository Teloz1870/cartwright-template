import "server-only";

/**
 * Simpel in-memory token-bucket rate-limiter.
 *
 * Design: per-key (IP eller session-id) holdes en bucket med tokens. Hver
 * request "trækker" 1 token. Buckets refyldes med `refillRate` tokens/sek
 * op til `capacity`. Når bucket'en er tom returneres `allowed: false`.
 *
 * **Begrænsninger:**
 * - In-memory: state nulstilles ved deploy/restart, og deler ikke på tværs
 *   af flere serverinstanser. For en single-instance dev/preview-deploy er
 *   det fint. Til prod med multi-instance bør vi skifte til Upstash Redis
 *   eller lignende.
 * - Ingen persistent ban-state — kun mid-window throttling.
 *
 * **Hvorfor token-bucket og ikke fixed-window?**
 * Fixed-window (X req/min) lader brugere lave Y × X req hvis de timer dem
 * lige omkring grænse-skift. Token-bucket håndterer bursts naturligt:
 * brugeren får X tokens at "bruge" ad gangen, men optjener langsomt nye.
 */

type Bucket = {
  tokens: number;
  lastRefillMs: number;
};

type LimiterConfig = {
  /** Max tokens i en bucket. Tillader en burst op til denne størrelse. */
  capacity: number;
  /** Hvor mange tokens optjenes per sekund. */
  refillRate: number;
  /** Hvor mange tokens et kald koster (default 1). */
  cost?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Sekunder til næste request hvis ikke allowed (estimat). */
  retryAfterSec: number;
};

/**
 * Factory der returnerer en limiter-instans bundet til en navngiven scope.
 * Hver scope har sin egen Map så fx chat-rate og admin-rate ikke konkurrerer.
 *
 *   const chatLimiter = createRateLimiter("assistant-chat", {
 *     capacity: 10, refillRate: 1/6,  // 10 chats burst, 1 hver 6 sek
 *   });
 *   const r = chatLimiter.check(req-ip);
 *   if (!r.allowed) return 429;
 */
export function createRateLimiter(name: string, config: LimiterConfig) {
  const buckets = new Map<string, Bucket>();
  const cost = config.cost ?? 1;

  // Periodisk garbage collect: fjern buckets der ikke er rørt i 10 minutter.
  // Vigtigt for ikke at lække memory hvis vi får mange unikke IPs.
  function gcIfNeeded(now: number) {
    if (buckets.size < 1000) return;
    const cutoff = now - 10 * 60 * 1000;
    for (const [key, b] of buckets) {
      if (b.lastRefillMs < cutoff) buckets.delete(key);
    }
  }

  function check(key: string): RateLimitResult {
    const now = Date.now();
    gcIfNeeded(now);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: config.capacity, lastRefillMs: now };
      buckets.set(key, bucket);
    } else {
      // Refyld baseret på forløbet tid
      const elapsedSec = (now - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(
        config.capacity,
        bucket.tokens + elapsedSec * config.refillRate,
      );
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterSec: 0,
      };
    }

    const deficit = cost - bucket.tokens;
    const retryAfterSec = Math.ceil(deficit / config.refillRate);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  // Eksponér for tests
  function reset(key?: string) {
    if (key) buckets.delete(key);
    else buckets.clear();
  }

  return { name, check, reset };
}

/**
 * Pre-konfigureret limiter for /api/assistant/chat. Generøs nok til reel
 * conversation (en burst på 10 beskeder, så 1 ny hvert 6. sekund), men
 * blokerer scripted abuse (looper med 100+ requests/sec).
 *
 * Hvis budgettet stadig løber løbsk, sænk capacity til 5 eller refillRate til 0.1.
 */
export const chatRateLimiter = createRateLimiter("assistant-chat", {
  capacity: 10,
  refillRate: 1 / 6, // 1 token hvert 6. sekund = 10 chats / minut sustained
});

/**
 * Rate-limiter til /api/admin/chat. Højere capacity end customer-chat fordi
 * admin er én betroet bruger der måske kører multi-step workflows i en burst
 * ("opdater lager på 8 produkter"). Keyed per session.user.id, ikke IP.
 */
export const adminChatRateLimiter = createRateLimiter("admin-chat", {
  capacity: 30,
  refillRate: 1 / 3, // 1 token hvert 3. sekund = 20 chats / minut sustained
});

export const magicLinkPerEmailLimiter = createRateLimiter("magic-link-email", {
  capacity: 3,
  refillRate: 1 / 1200,
});

export const magicLinkPerIpLimiter = createRateLimiter("magic-link-ip", {
  capacity: 10,
  refillRate: 1 / 360,
});

/**
 * Helper der konverterer rate-limit-failure til en Response.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: "Du går lidt for stærkt — vent et øjeblik og prøv igen.",
      retryAfterSec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
