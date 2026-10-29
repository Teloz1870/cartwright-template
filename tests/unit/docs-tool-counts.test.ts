import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listTools } from "@/lib/tools/registry";
import { SCOPES } from "@/lib/scopes";

/**
 * Docs-drift gate — the growth-audit (2026-07-12) caught the two public tool
 * docs contradicting each other (engine doc said 53 tools/21 scopes,
 * cartwright.app's mcp-tools.mdx said 36/19). Agents choosing tooling punish
 * contradictions, and hand-maintained counts WILL drift again.
 *
 * This test pins the ENGINE doc's stated counts to the registry — the same
 * committed==builder() staleness-gate convention as the marketplace-manifest
 * and registry-source tests. When a tool/scope is added, `pnpm test` fails
 * here until docs/scopes-and-tools.md's headline numbers are updated (and the
 * cartwright.app mdx should be updated in the same breath — it cites these).
 */

const doc = readFileSync(
  join(process.cwd(), "docs", "scopes-and-tools.md"),
  "utf8",
);

describe("docs/scopes-and-tools.md — headline counts match the registry", () => {
  it("scope count in 'The N scopes' heading matches lib/scopes.ts", () => {
    const m = doc.match(/### The (\d+) scopes/);
    expect(m, "heading '### The N scopes' missing from doc").toBeTruthy();
    expect(Number(m![1])).toBe(SCOPES.length);
  });

  it("tool + domain counts in 'The tool map' heading match lib/tools/registry.ts", () => {
    const m = doc.match(/## The tool map \((\d+) tools across (\d+) domains\)/);
    expect(m, "heading '## The tool map (N tools across M domains)' missing").toBeTruthy();
    const tools = listTools();
    const domains = new Set(tools.map((t) => t.name.split(".")[0]));
    expect(Number(m![1])).toBe(tools.length);
    expect(Number(m![2])).toBe(domains.size);
  });
});
