#!/usr/bin/env tsx
/**
 * Design import CLI — power-user path uden at gå gennem /admin/designs.
 *
 * Usage:
 *   tsx scripts/design-import.ts <file.md> [--from stitch|claude-design|cartwright] [--force] [--slug <slug>]
 *
 * Equivalent til /admin/designs upload-flow men kører lokalt på disk
 * uden DB. Scaffolder designs/<slug>/ filer; admin skal selv pege
 * BrandingSettings.designSlug på det nye slug via /admin/setup eller
 * /admin/designs.
 *
 * Eksempler:
 *   tsx scripts/design-import.ts ~/Downloads/my-design.md
 *   tsx scripts/design-import.ts ./stitch-export.md --from stitch
 *   tsx scripts/design-import.ts ./hero.tsx --from claude-design --slug warm-portfolio
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDesignMd } from "../lib/designs/parser";
import { scaffoldDesign } from "../lib/designs/codegen";
import { fromStitchMd } from "../lib/designs/adapters/stitch";
import { fromClaudeDesign } from "../lib/designs/adapters/claude-design";

async function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file) {
    console.error(
      "Usage: tsx scripts/design-import.ts <file> [--from <adapter>] [--force] [--slug <slug>]",
    );
    process.exit(1);
  }

  const adapter = getFlag(args, "--from") ?? "cartwright";
  const force = args.includes("--force");
  const slugOverride = getFlag(args, "--slug");

  const raw = readFileSync(resolve(file), "utf8");

  let normalized: string;
  switch (adapter) {
    case "cartwright":
      normalized = raw;
      break;
    case "stitch":
      normalized = fromStitchMd(raw, slugOverride ? { slug: slugOverride } : {});
      break;
    case "claude-design":
      normalized = fromClaudeDesign({
        source: raw,
        slug: slugOverride,
      });
      break;
    default:
      console.error(`Unknown adapter: ${adapter}`);
      process.exit(1);
  }

  const { spec, body } = parseDesignMd(normalized);
  const result = await scaffoldDesign(spec, body, { force });

  console.log(`✓ Installed design "${result.slug}"`);
  console.log("  Files:");
  for (const f of result.createdFiles) {
    console.log(`    ${f.replace(process.cwd() + "/", "")}`);
  }
  console.log(`  Registry updated: ${result.registryUpdated}`);
  console.log("");
  console.log("Next steps:");
  console.log(
    `  1. SET designSlug = "${result.slug}" via /admin/setup eller /admin/designs`,
  );
  console.log(`  2. Reload / for at se den nye design`);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
