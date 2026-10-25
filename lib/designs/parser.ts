/**
 * design.md parser — splitter YAML frontmatter fra Markdown body,
 * parser frontmatter til DesignMdSpec.
 *
 * Vi bruger js-yaml direkte (allerede transitiv dep) frem for at adde
 * gray-matter — det er kun ~5 linjer custom code for splitting og giver
 * os kontrol over error-messages. js-yaml's safe-load (load med default
 * schema) er fint for trusted input fra `npx cartwright design import`.
 *
 * Format (NB: --- skal være på egen linje, før og efter frontmatter):
 *
 *   ---
 *   schema: cartwright-design-v1
 *   slug: my-design
 *   ...
 *   ---
 *
 *   # Free-form markdown body (renders ikke — kun designer-notes)
 */
import yaml from "js-yaml";
import { DesignMdSchema, type DesignMdSpec } from "./spec";

export type ParsedDesign = {
  spec: DesignMdSpec;
  /** Raw markdown body (alt efter den lukkende `---`). Tom string hvis ingen. */
  body: string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parser en design.md fil til {spec, body}. Throws hvis frontmatter mangler,
 * YAML er invalid, eller schema-validation fejler.
 */
export function parseDesignMd(raw: string): ParsedDesign {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(
      "design.md mangler YAML frontmatter. Forvent: --- (newline) YAML (newline) --- (newline) markdown body.",
    );
  }
  const [, frontmatter, body] = match;

  let loaded: unknown;
  try {
    loaded = yaml.load(frontmatter, { filename: "design.md" });
  } catch (e) {
    throw new Error(
      `design.md frontmatter er ikke valid YAML: ${(e as Error).message}`,
    );
  }

  if (!loaded || typeof loaded !== "object") {
    throw new Error("design.md frontmatter skal være en YAML mapping (object).");
  }

  const parsed = DesignMdSchema.safeParse(loaded);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `design.md schema validation fejlede:\n${issues}\n\n` +
        `Se lib/designs/spec.ts for full schema, eller eksisterende ` +
        `designs/<slug>/design.md som reference.`,
    );
  }

  return { spec: parsed.data, body: body ?? "" };
}

/**
 * Convenience: bare parse spec'en, ignorér body. Bruges af import-action
 * når vi ikke skal store eller render markdown-body'en.
 */
export function parseDesignMdSpec(raw: string): DesignMdSpec {
  return parseDesignMd(raw).spec;
}
