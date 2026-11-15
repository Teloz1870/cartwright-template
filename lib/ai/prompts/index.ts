/**
 * ULTRAPLAN-lite UL2: prompt-loader for brand-portability.
 *
 * Centralized switch der vælger prompt-modul baseret på brand.ai.promptModule.
 * Erstatter tidligere hardcoded re-export fra lib/ai/client.ts:86 (kun
 * solbrillen) og lib/ai/operator-prompt.ts:16.
 *
 * Hvorfor static switch i stedet for dynamic import():
 * - Next.js/Turbopack/Webpack kan IKKE statisk analysere dynamic imports med
 *   variabler → giver build-warnings og potentielt runtime-issues på Edge
 * - Static switch er deterministisk: alle moduler bundles, men kun den valgte
 *   loades runtime (tree-shaking fjerner ubrugte i prod hvis vi tilføjer
 *   conditional-loading senere)
 *
 * Ved fork til nyt brand:
 * 1. Kopier `prompts/solbrillen.ts` → `prompts/<din-slug>.ts`
 * 2. Rediger SYSTEM_PROMPT + OPERATOR_SYSTEM_PROMPT
 * 3. Tilføj import + entry i PROMPT_MODULES nedenfor
 * 4. Sæt `brand.ai.promptModule = "<din-slug>"` i brand.config.ts
 *
 * Fallback til solbrillen-prompt hvis brand.ai.promptModule peger på et
 * modul der ikke er registreret — sikrer at app ikke crasher ved typo.
 */

import { brand } from "@/brand.config";
import * as genericPrompts from "./generic";

type PromptModule = {
  SYSTEM_PROMPT: string;
  OPERATOR_SYSTEM_PROMPT: string;
};

const PROMPT_MODULES: Record<string, PromptModule> = {
  generic: genericPrompts,
  // Tilføj nye industries her ved fork:
  // "panel-hegn": panelHegnPrompts,
  // "somosegaard": somosegaardPrompts,
};

const activeModule: PromptModule =
  PROMPT_MODULES[brand.ai.promptModule] ?? genericPrompts;

export const SYSTEM_PROMPT = activeModule.SYSTEM_PROMPT;
export const OPERATOR_SYSTEM_PROMPT = activeModule.OPERATOR_SYSTEM_PROMPT;
