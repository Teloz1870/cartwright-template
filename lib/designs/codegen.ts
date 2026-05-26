/**
 * design.md → designs/<slug>/ scaffold codegen.
 *
 * Tager en valideret DesignMdSpec og emitter:
 *   - designs/<slug>/design.md     (canonical spec, the source of truth)
 *   - designs/<slug>/index.ts      (DesignPack registration)
 *   - designs/<slug>/homepage.tsx  (homepage komponent der komponerer sections)
 *
 * Og opdaterer:
 *   - designs/index.ts             (register i DESIGNS-map)
 *   - designs/options.ts           (append metadata til DESIGN_OPTIONS)
 *
 * Vi codegenererer ikke section-atom-komponenter — de findes allerede i
 * designs/studio/sections/Studio*.tsx og deles på tværs af alle designs.
 * Hvis en imported design kræver en helt ny section-type, må authoren
 * adde komponenten manuelt og bruge `type: "opaque"` i design.md.
 *
 * Vigtigt: vi skriver til disk via fs/promises — denne fil må KUN kaldes
 * fra server-side context (CLI eller server-action), aldrig fra Client
 * Components. "server-only" import enforce'r dette.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { serializeDesignMd } from "./serializer";
import type { DesignMdSpec, DesignSection } from "./spec";

export type CodegenOptions = {
  /** Cartwright project root. Default = process.cwd() (eller --target arg). */
  cwd?: string;
  /**
   * Hvis true: overskriv eksisterende designs/<slug>/ filer. Default false
   * (kaster Error hvis mappen allerede findes så uventede overskrivninger
   * undgås).
   */
  force?: boolean;
};

export async function scaffoldDesign(
  spec: DesignMdSpec,
  body: string,
  opts: CodegenOptions = {},
): Promise<{ slug: string; createdFiles: string[]; registryUpdated: boolean }> {
  const cwd = opts.cwd ?? process.cwd();
  const designDir = path.join(cwd, "designs", spec.slug);

  // Existence-check (medmindre --force)
  try {
    await fs.access(designDir);
    if (!opts.force) {
      throw new Error(
        `designs/${spec.slug}/ findes allerede. Brug --force for at overskrive, ` +
          `eller skift slug i design.md.`,
      );
    }
  } catch (e) {
    // ENOENT er forventet — fortsæt med scaffold
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !opts.force) {
      throw e;
    }
  }

  await fs.mkdir(designDir, { recursive: true });

  // 1. design.md (canonical spec)
  const designMd = serializeDesignMd(spec, body);
  const designMdPath = path.join(designDir, "design.md");
  await fs.writeFile(designMdPath, designMd, "utf8");

  // 2. homepage.tsx
  const homepageTs = emitHomepage(spec);
  const homepagePath = path.join(designDir, "homepage.tsx");
  await fs.writeFile(homepagePath, homepageTs, "utf8");

  // 3. index.ts (DesignPack)
  const indexTs = emitIndex(spec);
  const indexPath = path.join(designDir, "index.ts");
  await fs.writeFile(indexPath, indexTs, "utf8");

  // 4. Registry-updates (designs/index.ts + designs/options.ts)
  const registryUpdated = await updateRegistry(spec, cwd);

  return {
    slug: spec.slug,
    createdFiles: [designMdPath, homepagePath, indexPath],
    registryUpdated,
  };
}

// ── Emit homepage.tsx ──────────────────────────────────────────────────────

function emitHomepage(spec: DesignMdSpec): string {
  // Det er bevidst sparsomt: vi bruger Studio-section-komponenter som
  // shared atoms fordi de allerede dækker hero/value-props/feature-grid/
  // how-it-works/stack-grid/cta-footer. Det betyder importerede designs
  // ikke trækker designs/studio/sections som transitive dep — men det
  // er fint, det er kun ren rendering-kode der re-deployer hver gang.
  const sectionRenders = spec.sections.map(renderSection).join("\n");

  return `/**
 * ${spec.name} — auto-genereret homepage fra design.md (cartwright-design-v1).
 *
 * IKKE rediger denne fil direkte — kør:
 *   npx cartwright design export ${spec.slug} > /tmp/design.md
 *   # edit /tmp/design.md
 *   npx cartwright design import /tmp/design.md --force
 *
 * Source-of-truth: ./design.md
 * Sections: ${spec.sections.map((s) => s.type).join(", ")}
 */
import type { DesignHomepageProps } from "../types";
${importedSectionAtoms(spec.sections)}

export default function ${pascalCase(spec.slug)}Homepage(_: DesignHomepageProps) {
  return (
    <div className="bg-${spec.tokens.prefix}-cream text-${spec.tokens.prefix}-ink">
${sectionRenders}
    </div>
  );
}
`;
}

function importedSectionAtoms(sections: DesignSection[]): string {
  const needed = new Set<string>();
  for (const s of sections) {
    switch (s.type) {
      case "hero":
        needed.add("StudioHero");
        needed.add("StudioButton");      // for fallback CTA-render
        break;
      case "value-props":
        needed.add("StudioValueProps");
        break;
      case "feature-grid":
        needed.add("StudioFeatureGrid");
        break;
      case "how-it-works":
        needed.add("StudioHowItWorks");
        break;
      case "stack-grid":
        needed.add("StudioStackGrid");
        break;
      case "cta-footer":
        needed.add("StudioCtaFooter");
        break;
      case "opaque":
        // Brugeren har sin egen komponent — vi importerer fra design-dir
        needed.add(`@local:${s.component}`);
        break;
    }
  }

  const studioAtoms = [...needed].filter((n) => !n.startsWith("@local:"));
  const localAtoms = [...needed]
    .filter((n) => n.startsWith("@local:"))
    .map((n) => n.replace("@local:", ""));

  const lines: string[] = [];
  if (studioAtoms.length) {
    // Import navngivne fra studio (skipping default-default exports).
    // Atoms har named exports allerede.
    const imports = studioAtoms.join(", ");
    lines.push(
      `import { ${imports} } from "@/designs/studio/sections/_index";`,
    );
  }
  for (const localName of localAtoms) {
    lines.push(`import { ${localName} } from "./${localName}";`);
  }
  return lines.join("\n");
}

function renderSection(section: DesignSection, idx: number): string {
  const indent = "      ";
  switch (section.type) {
    case "hero":
      return `${indent}<StudioHero
${indent}  eyebrow={${JSON.stringify(section.eyebrow ?? "")}}
${indent}  headline={${JSON.stringify(section.headline)}}
${indent}  headlineAccent={${JSON.stringify(section.headlineAccent ?? "")}}
${indent}  tagline={${JSON.stringify(section.tagline)}}
${indent}  ctaLabel={${JSON.stringify(section.cta.label)}}
${indent}  ctaHref={${JSON.stringify(section.cta.href)}}
${indent}  secondaryCtaLabel={${JSON.stringify(section.secondaryCta?.label ?? "")}}
${indent}  secondaryCtaHref={${JSON.stringify(section.secondaryCta?.href ?? "")}}
${indent}  microcopy={${JSON.stringify(section.microcopy ?? "")}}
${indent}/>`;
    case "value-props":
      return `${indent}<StudioValueProps
${indent}  eyebrow={${JSON.stringify(section.eyebrow ?? "")}}
${indent}  title={${JSON.stringify(section.title)}}
${indent}  description={${JSON.stringify(section.description ?? "")}}
${indent}  props={${JSON.stringify(section.items)}}
${indent}/>`;
    case "feature-grid":
      return `${indent}<StudioFeatureGrid
${indent}  eyebrow={${JSON.stringify(section.eyebrow ?? "")}}
${indent}  title={${JSON.stringify(section.title)}}
${indent}  description={${JSON.stringify(section.description ?? "")}}
${indent}  features={${JSON.stringify(section.items)}}
${indent}/>`;
    case "how-it-works":
      return `${indent}<StudioHowItWorks
${indent}  eyebrow={${JSON.stringify(section.eyebrow ?? "")}}
${indent}  title={${JSON.stringify(section.title)}}
${indent}  description={${JSON.stringify(section.description ?? "")}}
${indent}  steps={${JSON.stringify(section.items)}}
${indent}/>`;
    case "stack-grid":
      return `${indent}<StudioStackGrid
${indent}  eyebrow={${JSON.stringify(section.eyebrow ?? "")}}
${indent}  title={${JSON.stringify(section.title)}}
${indent}  description={${JSON.stringify(section.description ?? "")}}
${indent}  stack={${JSON.stringify(section.items)}}
${indent}/>`;
    case "cta-footer":
      return `${indent}<StudioCtaFooter
${indent}  title={${JSON.stringify(section.title)}}
${indent}  description={${JSON.stringify(section.description ?? "")}}
${indent}  ctaLabel={${JSON.stringify(section.cta.label)}}
${indent}  ctaHref={${JSON.stringify(section.cta.href)}}
${indent}  secondaryCtaLabel={${JSON.stringify(section.secondaryCta?.label ?? "")}}
${indent}  secondaryCtaHref={${JSON.stringify(section.secondaryCta?.href ?? "")}}
${indent}/>`;
    case "opaque":
      // Bruger har egen komponent — render som tag med deres props
      return `${indent}<${section.component} ${
        section.props
          ? Object.entries(section.props)
              .map(([k, v]) => `${k}={${JSON.stringify(v)}}`)
              .join(" ")
          : ""
      } />`;
  }
}

// ── Emit index.ts ──────────────────────────────────────────────────────────

function emitIndex(spec: DesignMdSpec): string {
  return `/**
 * ${spec.name} — auto-genereret DesignPack registration.
 *
 * Auto-genereret fra ./design.md af lib/designs/codegen.ts. Rediger
 * design.md i stedet og kør \`npx cartwright design import ./design.md --force\`.
 */
import type { DesignPack } from "../types";
import ${pascalCase(spec.slug)}Homepage from "./homepage";

export const ${camelCase(spec.slug)}Design: DesignPack = {
  slug: ${JSON.stringify(spec.slug)},
  name: ${JSON.stringify(spec.name)},
  description: ${JSON.stringify(spec.description)},
  mode: ${JSON.stringify(spec.mode)},
  premium: ${spec.premium ?? false},
  source: "design.md",
  tokens: ${JSON.stringify(spec.tokens, null, 2).replace(/\n/g, "\n  ")},
  homepage: ${pascalCase(spec.slug)}Homepage,
};
`;
}

// ── Update designs/index.ts + designs/options.ts (idempotent) ──────────────

async function updateRegistry(
  spec: DesignMdSpec,
  cwd: string,
): Promise<boolean> {
  const indexPath = path.join(cwd, "designs", "index.ts");
  const optionsPath = path.join(cwd, "designs", "options.ts");

  let changed = false;

  // designs/index.ts: tilføj import + DESIGNS-entry hvis ikke der allerede
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    if (!raw.includes(`"./${spec.slug}"`)) {
      const importLine = `import { ${camelCase(spec.slug)}Design } from "./${spec.slug}";`;
      const entryLine = `  "${spec.slug}": ${camelCase(spec.slug)}Design,`;

      // Insert import efter sidste eksisterende design-import
      const importMatch = raw.match(/(^import \{ \w+Design \} from "\.\/[\w-]+";\n)+/m);
      const withImport = importMatch
        ? raw.replace(importMatch[0], importMatch[0] + importLine + "\n")
        : raw.replace(/^(import [^\n]+;\n)/m, `$1${importLine}\n`);

      // Insert DESIGNS-entry før den lukkende `};`
      const withEntry = withImport.replace(
        /(const DESIGNS: Record<string, DesignPack> = \{[\s\S]*?)(\n\};)/,
        `$1\n${entryLine}$2`,
      );
      await fs.writeFile(indexPath, withEntry, "utf8");
      changed = true;
    }
  } catch {
    // index.ts ikke fundet — caller (CLI eller server-action) håndterer
  }

  // designs/options.ts: append DesignOption hvis ikke der allerede
  try {
    const raw = await fs.readFile(optionsPath, "utf8");
    if (!raw.includes(`slug: "${spec.slug}"`)) {
      const optionBlock = `  {
    slug: ${JSON.stringify(spec.slug)},
    name: ${JSON.stringify(spec.name)},
    description: ${JSON.stringify(spec.description)},
    mode: ${JSON.stringify(spec.mode)},
    premium: ${spec.premium ?? false},
  },`;
      // Insert før den lukkende `];` af DESIGN_OPTIONS
      const updated = raw.replace(
        /(export const DESIGN_OPTIONS: DesignOption\[\] = \[[\s\S]*?)(\n\];)/,
        `$1\n${optionBlock}$2`,
      );
      await fs.writeFile(optionsPath, updated, "utf8");
      changed = true;
    }
  } catch {
    // options.ts ikke fundet — caller håndterer
  }

  return changed;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pascalCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join("");
}

function camelCase(s: string): string {
  const pc = pascalCase(s);
  return pc[0]?.toLowerCase() + pc.slice(1);
}
