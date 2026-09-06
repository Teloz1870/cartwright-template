import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The plain-website door, in the files that ship INSIDE every scaffold. An AI
 * that reads this README after scaffolding `--profile site` must find the
 * site named first, told what does not apply to it, and pointed at
 * docs/simple-site.md — the 2026-09-06 incident's AI read a README about
 * DATABASE_URL and concluded "requires a database". Engine-only (the CLI may
 * rewrite the README it ships): same probe as repo-hygiene.test.ts.
 */
const ROOT = join(__dirname, "..", "..");
const isEngineCheckout = existsSync(join(ROOT, ".github", "sync-excludes.txt"));

describe.skipIf(!isEngineCheckout)("the site door inside the scaffold", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const guide = readFileSync(join(ROOT, "docs", "simple-site.md"), "utf8");
  const llms = readFileSync(join(ROOT, "app", "llms.txt", "route.ts"), "utf8");
  const llmsSite = readFileSync(join(ROOT, "app", "llms.txt", "route.static.ts"), "utf8");
  const briefings = ["AGENTS.md", ".claude/CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/cartwright.mdc", ".windsurfrules", "DEPLOY.md"];

  it("README: the site command comes first in the first command block, and the lede is qualified", () => {
    const block = readme.match(/```bash\n([\s\S]*?)```/)![1];
    const lines = block.split("\n").filter((l) => l.startsWith("npx create-cartwright"));
    expect(lines[0]).toContain("--profile site");
    expect(lines.some((l) => /my-shop\s/.test(l))).toBe(true);
    expect(readme).toMatch(/design — and, when you want them, database and backend/);
    // The stack sentence right under it must not put Prisma/Stripe before the door unqualified.
    expect(readme).toMatch(/Prisma,\s+Stripe and the Model Context Protocol in the database-backed profiles/);
    expect(readme).not.toMatch(/\*\*A real site with design, database and backend/);
  });

  it("README: a 'Just a website?' section, the in-scaffold pointer, and the env-var scope", () => {
    expect(readme).toContain("## Just a website? (`--profile site`)");
    expect(readme).toContain("Reading this README inside a scaffold?");
    expect(readme).toContain("the agent-tools, database, admin, sign-in and env-var sections");
    expect(readme).toMatch(/[Ss]tart with `docs\/simple-site\.md`/);
    const envIdx = readme.indexOf("## Required env vars");
    expect(readme.slice(envIdx, envIdx + 300)).toContain("a `site` scaffold boots and builds with none of these");
  });

  it("docs/simple-site.md: what you edit, measured with provenance, honest limits", () => {
    for (const h of ["## What you edit", "## Measured", "## Honest limits"]) expect(guide).toContain(h);
    // Provenance: dated, versioned (CLI + engine), keyed to a gate run — never typed.
    expect(guide).toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(guide).toMatch(/create-cartwright@\d+\.\d+\.\d+/);
    expect(guide).toMatch(/engine v\d+\.\d+\.\d+ \([0-9a-f]{7}\)/);
    expect(guide).toMatch(/release scaffold gate run \d{6,}/);
    expect(guide).toContain("Not a static export");
    expect(guide).toContain("RESEND_API_KEY");
  });

  it("the auto-loaded agent briefings, the sibling rule files and DEPLOY.md carry the site callout — the README is read on demand, these are read first", () => {
    for (const rel of briefings) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      expect(text, rel).toContain("`--profile site` scaffold?");
      expect(text, rel).toContain("docs/simple-site.md");
    }
    // The three briefings with a second database-dependent section ("Your first
    // 10 minutes") carry the callout there too — "skip the steps below" is per section.
    for (const rel of ["AGENTS.md", ".claude/CLAUDE.md", "GEMINI.md"]) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      expect(text.split("`--profile site` scaffold?").length - 1, `${rel} callouts`).toBeGreaterThanOrEqual(2);
    }
    // The Vercel deploy paragraph must not tell a site scaffold it needs Turso.
    expect(readme).toContain("A `site` scaffold needs none of this");
  });

  it("llms.txt badge names the database-free profile in both variants, with the qualified sentence", () => {
    expect(llms).toContain("--profile site");
    expect(llms).toContain("plain website with no database");
    expect(llms).toContain("design — and, when you want them, database and backend");
    expect(llms).not.toContain("a real site with design, database and backend");
    // The site twin already says what it was cut from; keep it that way.
    expect(llmsSite).toMatch(/no-database \*\*site\*\* profile/);
    expect(llmsSite).not.toContain("a real site with design, database and backend");
  });
});
