/**
 * Prompt-bygger for in-place copy-edit. Holdt bevidst minimal: modellen får
 * INGEN tools (propose-fasen kalder generateText uden tool-surface) — den er
 * reduceret til en ren tekst-transformer. Den eneste opgave er at omskrive ét
 * stykke copy efter en instruktion, i samme sprog og inden for et længde-budget.
 * Ingen server-only-afhængigheder: ren funktion, trivielt unit-testbar.
 */

export type RewritePromptInput = {
  /** Menneske-label for hvad der redigeres, fx "hero heading". */
  label: string;
  /** Nuværende tekst (kontekst for omskrivningen). */
  current: string;
  /** Admins instruktion ("gør den kortere", "mere venlig", ...). */
  note: string;
  /** Tegn-grænser fra targets.bounds() — gives til modellen som budget. */
  min: number;
  max: number;
};

export function buildRewritePrompt(input: RewritePromptInput): {
  system: string;
  prompt: string;
} {
  const system = [
    "You rewrite a single piece of copy for an online store / website.",
    "Return ONLY the new copy text — no preamble, no explanation, no surrounding quotes, no markdown fences, no labels.",
    `Keep it between ${input.min} and ${input.max} characters.`,
    "Write in the SAME language as the current text (Danish stays Danish, English stays English).",
    "Match the tone and voice of the current text. Do not invent facts, prices, names, or legal claims.",
  ].join(" ");

  const prompt = [
    `You are editing the ${input.label}.`,
    "",
    "Current text:",
    `"""${input.current}"""`,
    "",
    `Instruction: ${input.note}`,
    "",
    "Return only the rewritten text.",
  ].join("\n");

  return { system, prompt };
}

/**
 * Renser model-output: trimmer whitespace, fjerner markdown-kodehegn og ét evt.
 * omsluttende citationstegn-par modellen kan finde på at tilføje trods system-
 * prompten.
 */
export function stripQuotesAndTrim(raw: string): string {
  let s = raw.trim();
  // Fjern ```...``` code fences.
  if (s.startsWith("```")) {
    s = s
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }
  // Fjern ét omsluttende par af samme citationstegn.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"], // “ ”
    ["«", "»"], // « »
  ];
  for (const [open, close] of pairs) {
    if (s.length >= open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(open.length, s.length - close.length).trim();
      break;
    }
  }
  return s;
}
