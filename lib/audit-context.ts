import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped context som withAudit() læser fra når den skriver AuditLog-rows.
 *
 * Den blev introduceret af Local-AI planen for at kunne stamps hvert tool-call
 * med provider+model+modality uden at gennemgå hver enkelt lib/tools/*.ts og
 * tilføje ekstra args til withAudit-kald. AsyncLocalStorage propagerer
 * automatisk gennem async/await + Promise-chains + streamText's tool.execute
 * callbacks, så vi sætter context én gang øverst i route'n og hvert
 * downstream tool får felterne med "gratis".
 *
 * Voice-planen genbruger samme mekanisme — sætter modality="voice" +
 * sessionMinutes når /api/live/tool-dispatch invokes et tool.
 */

export type AuditContext = {
  /** "anthropic" | "local" | "google" — den AI-provider der drev kaldet */
  provider?: string;
  /** Model-id fx "claude-haiku-4-5", "gemma4:e4b", "gemini-2.5-flash-live" */
  model?: string;
  /** "text" eller "voice". Default "text" hvis ikke sat. */
  modality?: string;
  /** Kun for voice: hvor lang har sessionen været i minutter ind til dette tool-kald */
  sessionMinutes?: number;
};

const store = new AsyncLocalStorage<AuditContext>();

/**
 * Kør en async funktion med audit-context sat. Alle withAudit-kald inde i
 * `fn` får context'en stamps på deres rows automatisk.
 *
 * Brug pattern fra route-handlers:
 *   return withAuditContext(
 *     { provider: "local", model: "gemma4:e4b", modality: "text" },
 *     async () => streamText({...}).toUIMessageStreamResponse(),
 *   );
 */
export function withAuditContext<T>(
  ctx: AuditContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return Promise.resolve(store.run(ctx, fn));
}

/**
 * Læs aktuel audit-context. Returnerer undefined hvis ikke sat (fx fra cron-jobs
 * eller tests). withAudit håndterer undefined ved at sætte defaults.
 */
export function getAuditContext(): AuditContext | undefined {
  return store.getStore();
}
