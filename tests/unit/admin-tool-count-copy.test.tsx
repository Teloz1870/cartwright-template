import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ModelRecommendationCards from "@/components/admin/ModelRecommendationCards";
import { ADMIN_TOOL_ALLOWLIST } from "@/lib/ai/admin-tools";
import {
  TOOL_TIER_LABELS,
  adminToolCount,
  filterToolsForCapability,
  type ToolTier,
} from "@/lib/ai/model-capabilities";
import { filterToolsForCapability as serverFilter } from "@/lib/ai/client";
import { isEngineCheckout, onDisk, read, walkCode } from "../guards/_shared";

/**
 * ADMIN-COPY-37 — the admin said "All 37 admin tools" while the allowlist held
 * 40. Three hand-written copies of the number (two components, one doc) and a
 * handful of comments had each outlived the additions. The counts the admin
 * reads are now derived from ADMIN_TOOL_ALLOWLIST through the same tier lists
 * the filter applies, and no copy of a number is left to drift.
 */

const TIERS: ToolTier[] = ["read-only", "low-risk-writes", "all"];

describe("the tool counts the admin reads come from the allowlist", () => {
  it("'all' is the whole ADMIN_TOOL_ALLOWLIST", () => {
    expect(adminToolCount("all")).toBe(ADMIN_TOOL_ALLOWLIST.length);
    expect(TOOL_TIER_LABELS.all).toBe(`All ${ADMIN_TOOL_ALLOWLIST.length} admin tools`);
  });

  it("each smaller tier counts what the filter actually lets through", () => {
    for (const tier of ["read-only", "low-risk-writes"] as const) {
      const offered = filterToolsForCapability(ADMIN_TOOL_ALLOWLIST, { tools: tier });
      expect(offered.length, tier).toBeGreaterThan(0);
      expect(offered.length, tier).toBeLessThan(ADMIN_TOOL_ALLOWLIST.length);
      expect(TOOL_TIER_LABELS[tier], tier).toContain(`(${offered.length} tools)`);
    }
    expect(adminToolCount("read-only")).toBeLessThan(adminToolCount("low-risk-writes"));
  });

  it("the server client filters through the same lists", () => {
    expect(serverFilter).toBe(filterToolsForCapability);
  });

  it("the recommendation cards in /admin/integrations render those labels", () => {
    const html = renderToStaticMarkup(
      <ModelRecommendationCards endpoint="http://localhost:11434/v1" onPullComplete={() => {}} />,
    );
    for (const tier of TIERS) expect(html, tier).toContain(TOOL_TIER_LABELS[tier]);
  });
});

// Engine hygiene, not a property of a customer's tree: their own code may say
// "3 tools" about anything it likes.
describe.skipIf(!isEngineCheckout())("no hand-written admin tool count is left to drift", () => {
  // "37 tools", "~15 tools", "All 37 admin tools" — a number in front of "tools".
  const COUNT_RE = /~?\b\d+\s+(?:admin\s+)?tools\b/gi;

  it("finds none in app/, components/, lib/, plugins/ or docs/local-ai.md, comments included", () => {
    const hits: string[] = [];
    const files = ["app", "components", "lib", "plugins"].flatMap((zone) => walkCode(zone));
    if (onDisk("docs/local-ai.md")) files.push("docs/local-ai.md");
    for (const file of files) {
      for (const match of read(file).matchAll(COUNT_RE)) hits.push(`${file}: ${match[0]}`);
    }
    expect(hits, "derive it (lib/ai/model-capabilities.ts: adminToolCount) or say it without a number").toEqual([]);
  });
});
