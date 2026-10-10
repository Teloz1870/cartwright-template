import { z } from "zod";

/**
 * Genome list codec — the genome blob is string-only (the uniform primitive), so
 * a "list" field (e.g. the homepage value-prop cards) is stored as a JSON string
 * and decoded by the consumer. This keeps store.ts / apply.ts / the AI tool
 * untouched (they still see a plain string) while letting a field carry an array.
 */

export const genomeItemSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
});
export type GenomeItem = z.infer<typeof genomeItemSchema>;

export const genomeItemsSchema = z.array(genomeItemSchema).min(1).max(12);

/**
 * Field-level Zod validator: a JSON string that decodes to a valid items array.
 * Used as a Resolvable<string>.schema so override/resolved values are validated
 * exactly like any other string field.
 */
export const itemsJsonSchema = z
  .string()
  .refine(
    (s) => {
      try {
        return genomeItemsSchema.safeParse(JSON.parse(s)).success;
      } catch {
        return false;
      }
    },
    { message: "skal være en JSON-array af { title, body }" },
  );

export function encodeItems(items: GenomeItem[]): string {
  return JSON.stringify(items);
}

/** Decode a list-field string → items. Fail-soft to [] (never throws on render). */
export function decodeItems(s: string | undefined | null): GenomeItem[] {
  if (!s) return [];
  try {
    const parsed = genomeItemsSchema.safeParse(JSON.parse(s));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
