import { describe, it, expect } from "vitest";
import { parsePageLayout } from "@/lib/builder/section-schema";
import { resolvePageLayout } from "@/lib/builder/page-layout";
import { SECTION_REGISTRY, isSectionKey } from "@/lib/builder/section-registry";

/**
 * v0↔builder bridge — the `vibe` section. v0 emits free-form HTML; the bridge
 * stores it as a whitelisted section (`{ html }` props) so it flows through the
 * SAME governance (section-schema validation + pages.set_layout audit) and the
 * SAME render path (PageSections) as every other section — never TSX-to-disk.
 */

function tree(sections: unknown[]): string {
  return JSON.stringify({ sections });
}

describe("vibe section in the builder registry", () => {
  it("is a whitelisted section key with a label + default html", () => {
    expect(isSectionKey("vibe")).toBe(true);
    expect(SECTION_REGISTRY.vibe.label).toBeTruthy();
    const ok = SECTION_REGISTRY.vibe.propsSchema.safeParse(
      SECTION_REGISTRY.vibe.defaultProps,
    );
    expect(ok.success).toBe(true);
  });

  it("validates a vibe node with html through the page-layout schema", () => {
    const raw = tree([
      { id: "a", key: "vibe", props: { html: "<section class='p-4'>Hej</section>" } },
    ]);
    const parsed = parsePageLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections[0].key).toBe("vibe");
  });

  it("rejects a vibe node without html (required) and with extra props (strict)", () => {
    expect(parsePageLayout(tree([{ id: "a", key: "vibe", props: {} }]))).toBeNull();
    expect(
      parsePageLayout(
        tree([{ id: "a", key: "vibe", props: { html: "<p>x</p>", onload: "evil()" } }]),
      ),
    ).toBeNull();
  });

  it("resolves a vibe section for render with its html intact", () => {
    const raw = tree([
      { id: "a", key: "vibe", enabled: true, props: { html: "<div>v0 markup</div>" } },
    ]);
    const resolved = resolvePageLayout(raw);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].props).toEqual({ html: "<div>v0 markup</div>" });
  });
});
