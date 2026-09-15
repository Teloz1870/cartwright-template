import "server-only";

import type { GenomeDeps } from "../types";

/**
 * B3 static seam variant — the genome copy-field resolver WITHOUT the admin
 * module's AI stack (site-profile program). The materializer copies this
 * file over `lib/genome/resolvers/copy-field.ts` when the admin module is
 * not in the profile; NOTHING imports it in the shipped engine
 * (byte-identical until then).
 *
 * The genome READ path never invokes resolvers (readField returns
 * `override ?? resolved-cache ?? anchor`), so in a site profile this
 * function is unreachable — it exists so lib/genome/fields.ts' type import
 * and lazy `import("./resolvers/copy-field")` stay compilable. Resolution
 * (writing new copy) is an admin capability by definition.
 */

export type CopyFieldSpec = {
  /** Kort label (fx "footer tagline"). */
  label: string;
  /** Hvad strengen ER / hvor den vises — styrer modellens forståelse. */
  purpose: string;
  minLength: number;
  maxLength: number;
  /** Valgfri ekstra instruktion (fx "must mention the return policy"). */
  guidance?: string;
};

export async function resolveCopyField(
  _spec: CopyFieldSpec,
  _deps: GenomeDeps,
): Promise<string> {
  throw new Error(
    "Genome copy resolution requires the admin module's AI stack — this profile only reads anchors/overrides.",
  );
}
