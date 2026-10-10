/**
 * The Anthropic models the admin can pick in /admin/integrations → AI.
 *
 * Plain data (no `server-only`): the client form renders it, and the
 * server-side tables are tested against it. Every id here MUST have a row in
 * `MODEL_CAPABILITIES` (lib/ai/model-capabilities.ts) and in the price table
 * (lib/ai/usage.ts) — an id without a capability row silently falls back to
 * the read-only tool tier, and one without a price is metered as 0 kr.
 * tests/unit/ai-anthropic-models.test.ts pins both.
 */
export type AnthropicModelOption = { value: string; label: string };

export const ANTHROPIC_MODEL_OPTIONS: readonly AnthropicModelOption[] = [
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast + cheap, recommended)" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (better reasoning)" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (most expensive, deepest reasoning)" },
];

/**
 * The options to render for a stored model id. A shop that saved a model this
 * list no longer offers (e.g. `claude-sonnet-4-5` from an earlier release)
 * keeps it as an extra, clearly labelled option — otherwise the select would
 * show the first entry while the saved value stays the old one. The form passes
 * the SAVED value (not the live selection), so the extra option stays until
 * the form is saved.
 */
export function anthropicModelOptionsFor(current: string): AnthropicModelOption[] {
  const options = [...ANTHROPIC_MODEL_OPTIONS];
  const id = current.trim();
  if (id && !options.some((o) => o.value === id)) {
    options.push({ value: id, label: `${id} (saved — not in the current list)` });
  }
  return options;
}
