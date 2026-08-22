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

export const PUBLIC_AGENT_RATE_LIMIT = 60;

export const publicAgentPerIpLimiter = createRateLimiter("public-agent-api", {
  capacity: PUBLIC_AGENT_RATE_LIMIT,
  refillRate: 1,
});

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "RateLimit-Limit": String(PUBLIC_AGENT_RATE_LIMIT),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfterSec),
    "RateLimit-Policy": `${PUBLIC_AGENT_RATE_LIMIT};w=60`,
  };
}

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

// Kontaktformular: bremser spam-submissions mod /api/inquiries pr. IP. Generøst
// nok til en reel bruger (5 i burst), men stopper scripted spam.
export const inquiryPerIpLimiter = createRateLimiter("inquiry-ip", {
  capacity: 5,
  refillRate: 1 / 60, // 1 ny pr. minut sustained
});

// Offentlig AI-selvbetjening (/api/support/triage): kontaktformularen kalder den
// FØR /api/inquiries, så en indsendelse koster to LLM-rundture. Den er
// uautentificeret og kalder en betalt model, så den skal have sin egen bremse —
// ikke kun den betingede globale Upstash-limiter i proxy.ts. Strammere burst end
// inquiry: en reel bruger trykker én gang pr. henvendelse.
export const supportTriagePerIpLimiter = createRateLimiter("support-triage-ip", {
  capacity: 3,
  refillRate: 1 / 60, // 1 ny pr. minut sustained
});

// Offentligt kontakt-upload-endpoint (/api/contact/upload) — strammere end
// inquiry, da hver upload koster Blob-storage. 6 i burst (≤3 filer × 2 forsøg).
export const contactUploadPerIpLimiter = createRateLimiter("contact-upload-ip", {
  capacity: 6,
  refillRate: 1 / 120,
});

// Password-reset: samme konservative budget som magic-link (token-baseret email-
// flow). Per-email bremser reset-spam mod én konto; per-IP bremser bulk-prøver.
export const passwordResetPerEmailLimiter = createRateLimiter(
  "password-reset-email",
  { capacity: 3, refillRate: 1 / 1200 },
);

export const passwordResetPerIpLimiter = createRateLimiter("password-reset-ip", {
  capacity: 10,
  refillRate: 1 / 360,
});

/**
 * Voice-plan token-mint limiter. Voice-sessions koster penge per minut, så
 * loftet skal være meget mere konservativt end almindelig chat: 3 i burst
 * (giver normal kunde rum til to gen-forsøg ved netværks-hikke), 1 ny per
 * 20 min sustained — ~3 voice-sessions/time per IP.
 */
export const voiceTokenLimiter = createRateLimiter("voice-token-mint", {
  capacity: 3,
  refillRate: 1 / 1200, // 1 token per 20 minutter
});

/**
 * DSAR-eksport (/api/account/export) limiter. En ægte kunde henter sit data
 * sjældent; eksporten rører mange tabeller (orders+items, reviews, leads, ACP),
 * så vi beskytter mod en indlogget bruger der hamrer endpointet. Keyed per
 * session.user.id. 3 i burst (rum til gen-download), 1 ny per 10. minut.
 */
export const dataExportLimiter = createRateLimiter("account-data-export", {
  capacity: 3,
  refillRate: 1 / 600, // 1 token per 10 minutter
});

/**
 * Login brute-force limiters (parity-audit gap #3). The Credentials provider
 * had timing-oracle protection but NO attempt limiting — admin passwords could
 * be brute-forced unthrottled. We gate each authorize() attempt on TWO keys:
 *
 *  - per-IP: stops one host hammering many accounts (credential stuffing).
 *  - per-email: stops a distributed guess of ONE account's password.
 *
 * Budgets are tuned so a real human who fat-fingers their password a few times
 * is never blocked, but a script looping guesses backs off fast:
 *   per-email: 5 in burst, 1 new per 30s  → ~120 guesses/hr against one account
 *   per-IP:   10 in burst, 1 new per 12s  → wider net for a noisy source IP
 *
 * **TRADEOFF (documented):** this is the in-memory limiter — state is
 * per-instance and resets on deploy/restart, so on a multi-instance serverless
 * deploy an attacker spread across instances gets N× the budget. It is strictly
 * better than nothing (a single instance / single-region deploy is fully
 * covered) but for production at scale, set the Upstash env keys so the global
 * Redis limiter (proxy.ts) fronts /api/auth too. See this file's header note.
 */
export const loginPerEmailLimiter = createRateLimiter("login-email", {
  capacity: 5,
  refillRate: 1 / 30, // 1 new attempt token per 30 seconds
});

export const loginPerIpLimiter = createRateLimiter("login-ip", {
  capacity: 10,
  refillRate: 1 / 12, // 1 new attempt token per 12 seconds
});

/**
 * Helper der konverterer rate-limit-failure til en Response.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: "You are moving a little too fast. Wait a moment and try again.",
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
