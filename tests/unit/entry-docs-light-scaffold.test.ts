import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The files a stranger reads first tell a `light` scaffold the truth (DRØM160).
 *
 * `light` is the default profile, and it deletes a set of design packs. The
 * rules files, DESIGN.md and the Blank Canvas pack's own comments still point
 * at some of them as worked examples (`designs/drive`, `designs/stack`), so an
 * agent in a light scaffold was sent to folders that are not there. Each such
 * pointer now says, in the same paragraph, how to get the pack back:
 * `npx create-cartwright design install <slug>`.
 *
 * The pruned list belongs to the CLI, in the other repository:
 * cartwright-app `apps/cli/src/profile-light.ts` → `LIGHT_PRUNED_DESIGNS`, read
 * on origin/main 3483a3a (2026-11-27, CLI 2.9.20). It is copied here because
 * the engine has no file that matches what the CLI ships: `scaffold/manifest.json`
 * still lists `designs/stack` under the `light` alias of `managed-site`, which
 * is the future materializer (B39), not the published scaffolder. When the CLI
 * list changes, change this one.
 *
 * The same files name hoptify (full profile only), README's plugin catalogue
 * and `keptDesigns`; those lines are held to the same truth below.
 *
 * Scaffold-safe: it reads files from disk (no git, no locale), and a file a
 * scaffold does not carry is skipped. The one check that counts design packs
 * on disk runs in the engine only.
 */
const ROOT = join(__dirname, "..", "..");
const has = (rel: string) => existsSync(join(ROOT, rel));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const LIGHT_PRUNED_DESIGNS = [
  "saas-dark",
  "corporate-baseline",
  "webshop-classic",
  "webshop-minimal",
  "webshop-editorial",
  "webshop-bold",
  "northern-coffee",
  "atelier",
  "stack",
  "hoptify",
  "engineered",
  "editorial-ink",
  "nocturne",
  "aerospace",
  "flux",
  "drive",
];

const ENTRY_FILES = [
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/cartwright.mdc",
  ".github/copilot-instructions.md",
  "GEMINI.md",
  ".windsurfrules",
  "DESIGN.md",
  "README.md",
  "designs/blank/homepage.tsx",
  "designs/blank/chrome.tsx",
  "designs/blank/blank.css",
].filter(has);

/**
 * The packs `.cartwright/profile.json` → `keptDesigns` names: the CLI's
 * `LIGHT_KEPT_DESIGNS`, same file and commit as the pruned list above. Light
 * deletes only the pruned list, so a pack in neither list stays on disk
 * without being named in `keptDesigns`.
 */
const LIGHT_KEPT_DESIGNS = [
  "aurora-site",
  "fable",
  "stillwater",
  "halo",
  "jungle",
  "meridian",
  "brutalist",
  "apex",
  "aurora-shop",
  "studio",
  "blank",
];

/** The mirror exclude list never reaches a scaffold (same probe as repo-hygiene.test.ts). */
const isEngineCheckout = has(".github/sync-excludes.txt");

/** Every `designs/<slug>` folder that holds a pack (an `index.ts`). */
function packsOnDisk(): string[] {
  return readdirSync(join(ROOT, "designs"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && has(`designs/${d.name}/index.ts`))
    .map((d) => d.name)
    .sort();
}

/**
 * Paragraphs of a Markdown file or a block comment: runs of lines split at a
 * blank line, where a comment line holding only `*` or `//` counts as blank.
 */
function paragraphs(text: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(\*|\/\/)?\s*$/.test(line)) {
      if (current.length) out.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) out.push(current.join("\n"));
  return out;
}

/**
 * Every `designs/<slug>` of a light-pruned pack whose paragraph does not go on
 * to name `design install <slug>`.
 */
function strandedPointers(text: string): string[] {
  const stranded: string[] = [];
  for (const para of paragraphs(text)) {
    for (const m of para.matchAll(/designs\/([a-z0-9-]+)/g)) {
      const slug = m[1];
      if (!LIGHT_PRUNED_DESIGNS.includes(slug)) continue;
      if (!para.slice(m.index).includes(`design install ${slug}`)) {
        stranded.push(`designs/${slug} in: ${para.trim().slice(0, 120)}`);
      }
    }
  }
  return stranded;
}

describe("the entry files tell a light scaffold which packs it lacks", () => {
  it("the checker flags a stranded pointer and accepts the fixed one", () => {
    expect(strandedPointers("Worked example: `designs/drive`.\n\nOther text: design install drive")).toHaveLength(1);
    expect(strandedPointers("Example: `designs/drive` (light prunes it: `design install drive`).")).toEqual([]);
    expect(strandedPointers(" * see designs/stack\n *\n * design install stack")).toHaveLength(1);
    expect(strandedPointers("Copy `designs/blank` or `designs/aurora-site`.")).toEqual([]);
  });

  it("every pointer at a pruned pack says how to install it back, in the same paragraph", () => {
    expect(ENTRY_FILES).toContain("AGENTS.md"); // every scaffold ships it
    for (const rel of ENTRY_FILES) {
      expect(strandedPointers(read(rel)), rel).toEqual([]);
    }
  });

  // /en/webmcp-check lists only the ACTIVE design's pack tools, and a coffee
  // scaffold renders in aurora-shop, so the brew tool is a promise only once
  // the reader is told which pack carries it and how to turn that pack on.
  it.skipIf(!has("README.md"))("README names the pack behind calculate_brew_ratio and how to activate it", () => {
    const paras = paragraphs(read("README.md")).filter((p) => p.includes("calculate_brew_ratio"));
    for (const p of paras) {
      expect(p).toContain("`crema`");
      expect(p).toMatch(/\/admin\/designs|design\.set_slug/);
    }
  });

  it.skipIf(!has("README.md"))("a timing README calls measured carries the engine version and date it was measured on", () => {
    const paras = paragraphs(read("README.md")).filter((p) => /measured/i.test(p) && /\d+\s*seconds/.test(p));
    for (const p of paras) {
      expect(p).toMatch(/\bv\d+\.\d+\.\d+\b/);
      expect(p).toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    }
  });

  // Light prunes the hoptify plugin, its admin route, its importer and its
  // design pack, so a line that names any of them without the note sends a
  // light reader to something that is not there.
  it("every line that names hoptify says it is full profile only", () => {
    for (const rel of ENTRY_FILES) {
      for (const line of read(rel).replace(/\r\n/g, "\n").split("\n")) {
        if (/hoptify/i.test(line)) expect(line, rel).toMatch(/full profile only/i);
      }
    }
  });

  it.skipIf(!has("README.md") || !has("plugins/registry.ts"))(
    "README's plugin catalogue lists every plugin the registry imports, and its count matches the list",
    () => {
      const [para] = paragraphs(read("README.md")).filter((p) => p.includes("Current catalogue:"));
      expect(para, "README has no plugin catalogue paragraph").toBeTruthy();
      const m = /Current catalogue:\s*([\s\S]*?)\s+—\s+currently (\d+)\b/.exec(para);
      expect(m, "the catalogue is not `Current catalogue: a, b, … — currently N`").toBeTruthy();
      const listed = m![1].split(/,\s*/).map((s) => s.trim());
      expect(Number(m![2]), "the count is not the number of plugins listed").toBe(listed.length);
      // A light scaffold's registry lacks hoptify; the README still lists it with its note.
      const imported = [...read("plugins/registry.ts").matchAll(/from "\.\/([a-z0-9-]+)\/manifest"/g)].map((r) => r[1]);
      expect(imported.length).toBeGreaterThan(0);
      for (const slug of imported) expect(listed, `plugins/${slug} is missing from README`).toContain(slug);
    },
  );

  it("keptDesigns is not called the exact list of packs a light scaffold carries", () => {
    for (const rel of ENTRY_FILES) {
      for (const line of read(rel).replace(/\r\n/g, "\n").split("\n")) {
        if (line.includes("keptDesigns")) expect(line, rel).not.toMatch(/exact list/i);
      }
    }
  });

  // Engine-only: a customer adds packs of their own, and a scaffold has
  // already lost the pruned ones; the engine carries every pack.
  it.skipIf(!isEngineCheckout || !has(".claude/CLAUDE.md"))(
    "the keptDesigns line names every pack light keeps on disk outside keptDesigns",
    () => {
      const unlisted = packsOnDisk().filter((s) => !LIGHT_PRUNED_DESIGNS.includes(s) && !LIGHT_KEPT_DESIGNS.includes(s));
      expect(unlisted.length, "no pack outside both lists: drop the note, or the lists drifted").toBeGreaterThan(0);
      const [line] = read(".claude/CLAUDE.md")
        .split("\n")
        .filter((l) => l.includes("keptDesigns"));
      expect(line, ".claude/CLAUDE.md does not name keptDesigns").toBeTruthy();
      for (const slug of unlisted) expect(line, `${slug} stays on disk in light`).toContain(`\`${slug}\``);
    },
  );
});
