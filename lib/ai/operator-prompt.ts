/**
 * System-prompt til operatør-chat (/admin/ai).
 *
 * ULTRAPLAN-lite UL2: re-export fra dynamic prompt-loader. Vælger automatisk
 * korrekt brand-modul baseret på brand.ai.promptModule. Ved fork: tilføj nyt
 * modul i lib/ai/prompts/index.ts og opdatér brand.config.
 *
 * Vigtige principper (gælder for ALLE brand-prompt-moduler):
 * 1. Plan-først: AI'en udfører IKKE write-tools direkte; den BEDER om bekræftelse
 *    via plan-cards i UI'et (server håndhæver via CONFIRM_REQUIRED-gate, men
 *    AI'en skal også italesætte det).
 * 2. Forklarlig: hver tool-kald bør have en kort begrundelse for admin.
 * 3. Audit-bevidst: AI'en ved at alle dens handlinger logges synligt for
 *    revisor — det får den til at være præcis og konservativ.
 */
export { OPERATOR_SYSTEM_PROMPT } from "@/lib/ai/prompts";
