import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { SpeculationRules } from "@/components/SpeculationRules";

describe("SpeculationRules", () => {
  it("emits a valid speculationrules script with a conservative moderate prefetch ruleset", () => {
    const html = renderToStaticMarkup(<SpeculationRules />);
    expect(html).toContain('type="speculationrules"');

    const inner = html
      .replace(/^[\s\S]*<script type="speculationrules">/, "")
      .replace(/<\/script>[\s\S]*$/, "");
    const rules = JSON.parse(inner);

    const rule = rules.prefetch[0];
    expect(rule.source).toBe("document");
    expect(rule.eagerness).toBe("moderate"); // conservative, not prerender/eager
    expect(rules).not.toHaveProperty("prerender"); // prefetch-only for now
  });

  it("excludes /admin, /api, and opt-out selectors from prefetch", () => {
    const html = renderToStaticMarkup(<SpeculationRules />);
    const inner = html
      .replace(/^[\s\S]*<script type="speculationrules">/, "")
      .replace(/<\/script>[\s\S]*$/, "");
    const clauses = JSON.stringify(JSON.parse(inner).prefetch[0].where);

    expect(clauses).toContain("/admin/*");
    expect(clauses).toContain("/api/*");
    expect(clauses).toContain("[data-no-prefetch]");
  });
});
