/**
 * Models whose provider has announced the day they stop answering. Plain data
 * (no `server-only`): the /admin/integrations form reads it to put a dated
 * warning under a saved model, and `lib/ai/client.ts` reads it to turn the
 * provider's "not found" after that day into an error that says why.
 *
 * Nothing here changes which model runs. A saved id is never rewritten, and
 * nothing is blocked before the date — the admin switches by saving the form.
 * The models the admin can pick (`lib/ai/anthropic-models.ts`) and the default
 * must not retire within 60 days of a row's check; every successor must be one
 * the admin can pick. tests/unit/ai-model-retirements.test.tsx pins both.
 */

export type ModelRetirement = {
  /**
   * The provider's retirement day (ISO date). From that day on, requests fail.
   * The source names the day, not the hour, so the engine counts from 00:00 UTC.
   */
  retiresAt: string;
  /** The provider's recommended replacement. */
  successor: string;
  /** Where the date and the successor were read. */
  source: string;
  /** The day the row was last checked against `source`. */
  verifiedAt: string;
};

const ANTHROPIC_DEPRECATIONS = "https://platform.claude.com/docs/en/about-claude/model-deprecations";

// Deprecated 2026-09-30. The source lists the dated id; the alias the admin
// list used to offer resolves to the same model, so it retires with it.
const SONNET_4_5: ModelRetirement = {
  retiresAt: "2026-11-30",
  successor: "claude-sonnet-5-5",
  source: ANTHROPIC_DEPRECATIONS,
  verifiedAt: "2026-10-23",
};

export const MODEL_RETIREMENTS: Readonly<Record<string, ModelRetirement>> = {
  "claude-sonnet-4-5": SONNET_4_5,
  "claude-sonnet-4-5-20250929": SONNET_4_5,
};

const GOOGLE_DEPRECATIONS = "https://ai.google.dev/gemini-api/docs/deprecations";

/**
 * Embedding models, kept apart from the chat models above: nothing in the
 * admin picks one (the id comes from `GEMINI_EMBED_MODEL` or the default in
 * `lib/ai/embeddings.ts`), so these rows carry no "the admin can pick the
 * successor" promise. The default embedding model must never have a row here
 * (tests/unit/embeddings.test.ts).
 */
export const EMBEDDING_MODEL_RETIREMENTS: Readonly<Record<string, ModelRetirement>> = {
  // The engine's default until v0.67. Shut down; requests fail.
  "text-embedding-004": {
    retiresAt: "2026-01-14",
    successor: "gemini-embedding-2",
    source: GOOGLE_DEPRECATIONS,
    verifiedAt: "2026-11-14",
  },
  "embedding-001": {
    retiresAt: "2025-10-30",
    successor: "gemini-embedding-2",
    source: GOOGLE_DEPRECATIONS,
    verifiedAt: "2026-11-14",
  },
  // Still answering: named in the old code comment as the override to reach for.
  "gemini-embedding-001": {
    retiresAt: "2028-05-14",
    successor: "gemini-embedding-2",
    source: GOOGLE_DEPRECATIONS,
    verifiedAt: "2026-11-14",
  },
};

/** The retirement row for an embedding model id (trimmed, own key), or `null`. */
export function embeddingModelRetirement(modelId: string): ModelRetirement | null {
  const id = modelId.trim();
  return Object.hasOwn(EMBEDDING_MODEL_RETIREMENTS, id) ? EMBEDDING_MODEL_RETIREMENTS[id] : null;
}

/**
 * The retirement row for a model id, or `null`. The admin saves ids trimmed,
 * so the lookup runs on the trimmed id; an own key only, never `toString`.
 */
export function modelRetirement(modelId: string): ModelRetirement | null {
  const id = modelId.trim();
  return Object.hasOwn(MODEL_RETIREMENTS, id) ? MODEL_RETIREMENTS[id] : null;
}

/** True from the first moment (UTC) of the retirement day. */
export function isRetired(retirement: ModelRetirement, now: Date): boolean {
  return now.getTime() >= Date.parse(`${retirement.retiresAt}T00:00:00Z`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "30 Nov 2026". A fixed format rather than `toLocaleDateString`, so the
 * server render and the browser agree whatever their locale and time zone.
 */
export function formatRetirementDay(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * The warning the admin sees under a model that retires, dated and naming the
 * successor; `null` for every other id. `now` is injectable for tests.
 */
export function modelRetirementNotice(modelId: string, now: Date = new Date()): string | null {
  const retirement = modelRetirement(modelId);
  if (!retirement) return null;
  const day = formatRetirementDay(retirement.retiresAt);
  return isRetired(retirement, now)
    ? `Retired ${day} — every AI request with ${modelId.trim()} now fails. Switch to ${retirement.successor} and save.`
    : `Retires ${day} — switch to ${retirement.successor} and save. It keeps working until then, and your saved choice is not changed for you.`;
}

/**
 * Thrown in place of the provider's "not found" for a model past its
 * retirement day, so the failure names the day and the way out instead of
 * an opaque provider message. The provider's own error is the `cause`.
 */
export class RetiredModelError extends Error {
  readonly modelId: string;
  readonly retirement: ModelRetirement;

  constructor(modelId: string, retirement: ModelRetirement, options?: { cause?: unknown }) {
    super(
      `${modelId} was retired on ${formatRetirementDay(retirement.retiresAt)} — ` +
        `choose ${retirement.successor} in /admin/integrations → AI and save.`,
      options,
    );
    this.name = "RetiredModelError";
    this.modelId = modelId;
    this.retirement = retirement;
  }
}
