/**
 * design.md serializer — modsat af parser. Tager en DesignMdSpec og
 * emitter en canonical design.md string der round-tripper rent gennem
 * parseDesignMd().
 *
 * Bruges af `npx cartwright design export <slug>` så designs kan deles
 * mellem shops eller commit'es til en privat design-library uden at
 * skulle hand-skrive YAML. Caller resolver typically DesignPack →
 * DesignMdSpec via designs/<slug>/design.md (canonical source) — denne
 * fil ER allerede den canonical form, vi just normaliserer den.
 */
import yaml from "js-yaml";
import type { DesignMdSpec } from "./spec";

export function serializeDesignMd(spec: DesignMdSpec, body = ""): string {
  // js-yaml's dump producerer block-style YAML der matcher hånd-skrevne
  // design.md filer (ingen flow-style brackets). lineWidth=120 så lange
  // copy-strings ikke folder unødvendigt; noRefs så same-string ikke får
  // anchor-refs der er svære at læse for humans.
  const frontmatter = yaml.dump(spec, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,    // bevar field-order fra DesignMdSpec
  });

  // Trim trailing newline fra dump (vi tilføjer vores egen consistent
  // separator). Tilføj body med single newline mellem.
  const trimmedBody = body.trim();
  return `---\n${frontmatter.trimEnd()}\n---\n${trimmedBody ? `\n${trimmedBody}\n` : ""}`;
}
