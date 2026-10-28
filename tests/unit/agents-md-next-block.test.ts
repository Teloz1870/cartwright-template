import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AGENTS.md opens with the block `next dev` manages (between the
 * `nextjs-agent-rules` markers). When `next dev` runs under an AI agent it asks
 * `hasCurrentAgentRules()` whether that block is exactly the one the installed
 * Next generates, and rewrites it when it is not — so a block that differs by a
 * single byte dirties AGENTS.md on an agent's first `next dev`, here and in
 * every scaffold cut from this tree. Next 16.4 writes `## This is NOT the
 * Next.js you know`; the file said `# …` (TREND24-a).
 *
 * This calls Next's own predicate, so a Next bump that changes the block fails
 * here, in the dependency PR, instead of in a customer's working tree.
 *
 * Engine-only (the repo-hygiene probe): a scaffold may run another Next, and
 * there `next dev` keeps the block current itself. The generator is internal,
 * not public API, so a Next without it skips this rather than failing.
 */
const ROOT = join(__dirname, "..", "..");
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));
const GENERATOR = "next/dist/server/lib/generate-agent-files";

type AgentRules = { hasCurrentAgentRules: (dir: string) => boolean };

function loadGenerator(): AgentRules | null {
  try {
    const mod = createRequire(join(ROOT, "package.json"))(GENERATOR) as Partial<AgentRules>;
    return typeof mod.hasCurrentAgentRules === "function" ? (mod as AgentRules) : null;
  } catch {
    return null;
  }
}

const generator = isEngineCheckout ? loadGenerator() : null;

describe.skipIf(!generator)("AGENTS.md carries the agent-rules block the installed Next writes", () => {
  it("next dev finds the block current and leaves AGENTS.md alone", () => {
    expect(
      generator!.hasCurrentAgentRules(ROOT),
      `AGENTS.md's nextjs-agent-rules block is not what this Next writes, so \`next dev\` would rewrite it — ` +
        `copy buildAgentRulesBlock() from node_modules/${GENERATOR}.js verbatim`,
    ).toBe(true);
  });
});
