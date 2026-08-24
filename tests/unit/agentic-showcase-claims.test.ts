import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AgenticShowcaseHomepage from "../../designs/agentic-showcase/homepage";
import {
  AgenticShowcaseFooter,
  AgenticShowcaseHeader,
} from "../../designs/agentic-showcase/chrome";

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

  it("does not advertise removed agent/admin interfaces in a static site profile", () => {
    const homepage = renderToStaticMarkup(
      createElement(AgenticShowcaseHomepage, {
        settings: null,
        locale: "en",
        agentApiEnabled: false,
      }),
    );
    const header = renderToStaticMarkup(
      createElement(AgenticShowcaseHeader, {
        locale: "en",
        agentApiEnabled: false,
        accountAndAdminEnabled: false,
      }),
    );
    const footer = renderToStaticMarkup(
      createElement(AgenticShowcaseFooter, {
        locale: "en",
        agentApiEnabled: false,
        accountAndAdminEnabled: false,
      }),
    );
    const html = `${homepage}${header}${footer}`;

    expect(html).not.toContain("/openapi.json");
    expect(html).not.toContain("/.well-known/mcp.json");
    expect(html).not.toContain("/api/v1/tools");
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain("/en/developers");
    expect(html).toContain("Agent interfaces are disabled in this profile");
  });

  it("advertises the live contracts when the resolved profile enables them", () => {
    const html = renderToStaticMarkup(
      createElement(AgenticShowcaseHomepage, {
        settings: null,
        locale: "en",
        agentApiEnabled: true,
      }),
    );

    expect(html).toContain("/openapi.json");
    expect(html).toContain("/.well-known/mcp.json");
    expect(html).toContain("/api/v1/tools");
    expect(html).toContain("/en/developers");
  });
});
