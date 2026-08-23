import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const showcaseRoot = join(process.cwd(), "designs", "agentic-showcase");

const publicCopy = [
  "homepage.tsx",
  "chrome.tsx",
  "design.md",
].map((file) => readFileSync(join(showcaseRoot, file), "utf8")).join("\n");

describe("Agentic Showcase evidence policy", () => {
  it("does not ship an unverified score, fake report language or public credentials", () => {
    expect(publicCopy).not.toMatch(/100\s*\/\s*100/i);
    expect(publicCopy).not.toMatch(/official (?:is-agentic|audit) report/i);
    expect(publicCopy).not.toContain("admin1234");
    expect(publicCopy).not.toContain("defaultValue=\"admin@");
  });

  it("points users at live contracts and labels independent verification honestly", () => {
    expect(publicCopy).toContain("/openapi.json");
    expect(publicCopy).toContain("/.well-known/mcp.json");
    expect(publicCopy).toContain("/llms.txt");
    expect(publicCopy).toMatch(/verification pending|scoreverifikation afventer/i);
  });
});
