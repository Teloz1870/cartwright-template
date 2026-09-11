import "server-only";

import { prisma } from "@/lib/db";

/**
 * Token-niveau cost-metering (Hul E). Fanger faktisk input/output-token-forbrug
 * pr. AI-request (via streamText `onFinish.totalUsage`) og aggregerer det i
 * `IntegrationSettings.aiUsageJson` med et estimeret kroner-beløb. Komplementerer
 * call-count-lofterne (MAX_TOOL_CALLS_PER_SESSION) med reel omkostningsindsigt.
 *
 * pure-funktionerne (estimateCostDkk, mergeUsage) er sideeffekt-frie og testbare;
 * recordAiUsage laver den transaktionelle read-modify-write (SQLite serialiserer
 * writes → ingen lost updates).
 */

export type UsageTokens = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

// Priser pr. 1M tokens i USD (input / output). Kun cloud-modeller koster —
// lokale Ollama-modeller (og ukendte) tæller som 0 kr. Tal matcher de offentlige
// Anthropic-listepriser; overstyrbare ved at redigere her når priser ændres.
const PRICING_USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-5": { in: 15, out: 75 },
  "claude-opus-4-7": { in: 15, out: 75 },
};

const DEFAULT_USD_TO_DKK = 7;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Estimér kroner-omkostning for ét request. Ukendt/lokal model → 0. */
export function estimateCostDkk(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING_USD_PER_MTOK[model];
  if (!p) return 0;
  const usd =
    (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
  const rate = Number(process.env.USD_TO_DKK) || DEFAULT_USD_TO_DKK;
  return round4(usd * rate);
}

type ModelBucket = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estCostDkk: number;
};
type DayBucket = { requests: number; totalTokens: number; estCostDkk: number };

export type AiUsageAggregate = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estCostDkk: number;
  perModel: Record<string, ModelBucket>;
  byDay: Record<string, DayBucket>;
  updatedAt: string;
};

const EMPTY: AiUsageAggregate = {
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estCostDkk: 0,
  perModel: {},
  byDay: {},
  updatedAt: "",
};

/** Parse den gemte JSON-aggregat robust (tom/korrupt → frisk aggregat). */
export function parseAggregate(raw: string | null | undefined): AiUsageAggregate {
  if (!raw) return { ...EMPTY };
  try {
    const v = JSON.parse(raw) as Partial<AiUsageAggregate>;
    return {
      requestCount: typeof v?.requestCount === "number" ? v.requestCount : 0,
      inputTokens: typeof v?.inputTokens === "number" ? v.inputTokens : 0,
      outputTokens: typeof v?.outputTokens === "number" ? v.outputTokens : 0,
      totalTokens: typeof v?.totalTokens === "number" ? v.totalTokens : 0,
      estCostDkk: typeof v?.estCostDkk === "number" ? v.estCostDkk : 0,
      perModel: typeof v?.perModel === "object" && v.perModel ? v.perModel : {},
      byDay: typeof v?.byDay === "object" && v.byDay ? v.byDay : {},
      updatedAt: typeof v?.updatedAt === "string" ? v.updatedAt : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Pure: flet ét requests forbrug ind i aggregatet. */
export function mergeUsage(
  prev: AiUsageAggregate,
  model: string,
  usage: UsageTokens,
  day: string,
  nowIso: string,
): AiUsageAggregate {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  const total = usage?.totalTokens ?? input + output;
  const cost = estimateCostDkk(model, input, output);

  const pm = prev.perModel[model] ?? {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estCostDkk: 0,
  };
  const bd = prev.byDay[day] ?? { requests: 0, totalTokens: 0, estCostDkk: 0 };

  const pm_req = pm.requests ?? 0;
  const pm_in = pm.inputTokens ?? 0;
  const pm_out = pm.outputTokens ?? 0;
  const pm_cost = pm.estCostDkk ?? 0;

  const bd_req = bd.requests ?? 0;
  const bd_tot = bd.totalTokens ?? 0;
  const bd_cost = bd.estCostDkk ?? 0;

  const nextByDay = {
    ...prev.byDay,
    [day]: {
      requests: bd_req + 1,
      totalTokens: bd_tot + total,
      estCostDkk: round4(bd_cost + cost),
    },
  };

  // Pruning: Keep only the most recent 90 days to prevent unbounded JSON growth
  const days = Object.keys(nextByDay).sort();
  if (days.length > 90) {
    const toRemove = days.slice(0, days.length - 90);
    for (const d of toRemove) {
      delete nextByDay[d];
    }
  }

  return {
    requestCount: prev.requestCount + 1,
    inputTokens: prev.inputTokens + input,
    outputTokens: prev.outputTokens + output,
    totalTokens: prev.totalTokens + total,
    estCostDkk: round4(prev.estCostDkk + cost),
    perModel: {
      ...prev.perModel,
      [model]: {
        requests: pm_req + 1,
        inputTokens: pm_in + input,
        outputTokens: pm_out + output,
        estCostDkk: round4(pm_cost + cost),
      },
    },
    byDay: nextByDay,
    updatedAt: nowIso,
  };
}

/**
 * Optag forbruget fra ét AI-request. Best-effort: fejler aldrig kalderen
 * (metering må ikke kunne vælte en chat-response). Transaktionel read-modify-
 * write så samtidige requests ikke overskriver hinandens tal.
 */
export async function recordAiUsage(opts: {
  provider: string;
  model: string;
  modality: string;
  usage: UsageTokens;
}): Promise<void> {
  // Spring helt over hvis der intet token-tal er (fx local provider uden usage).
  const { inputTokens, outputTokens, totalTokens } = opts?.usage ?? {};
  if (!inputTokens && !outputTokens && !totalTokens) return;

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const nowIso = now.toISOString();
      await prisma.$transaction(async (tx) => {
        const row = await tx.integrationSettings.findUnique({
          where: { id: 1 },
          select: { aiUsageJson: true },
        });
        const next = mergeUsage(
          parseAggregate(row?.aiUsageJson),
          opts.model,
          opts.usage,
          day,
          nowIso,
        );
        const aiUsageJson = JSON.stringify(next);
        await tx.integrationSettings.upsert({
          where: { id: 1 },
          update: { aiUsageJson },
          create: { id: 1, aiUsageJson },
        });
      });
      return; // Success!
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[ai-usage] recordAiUsage failed after ${maxRetries} attempts:`, err);
      } else {
        // Wait with a small random jitter before retrying (50ms - 150ms)
        const delay = 50 + Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
