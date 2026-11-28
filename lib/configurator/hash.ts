import { createHash } from "node:crypto";

import type { Definition } from "@/lib/configurator/types";

/** JSON with sorted keys and no `undefined`, so equal rows hash equal. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/**
 * sha256 of the rule as canonical JSON, so a snapshot names exactly the rule it used. `presentation`
 * is outside, so a new summary does not look like a price change. A field's, an option's and a
 * discount's label are not in `presentation`, and they do move it.
 */
export function ruleHash(definition: Definition): string {
  return createHash("sha256").update(stableJson({ ...definition, presentation: undefined })).digest("hex");
}
