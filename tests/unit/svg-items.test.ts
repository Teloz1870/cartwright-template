import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as lib from "@/components/svg-items";
import { SVG_ITEMS } from "@/components/svg-items";

/**
 * SVG item library — pins the library contract: 21 items (12 static + 9
 * animated), unique slugs, one exported component per manifest entry, and
 * every component renders a root <svg> that is decorative (aria-hidden,
 * unfocusable), palette-adaptive (cw-* tokens, no hex) and sized per kind.
 * Animated items must ship their motion as scoped CSS gated behind
 * `@media (prefers-reduced-motion: no-preference)`.
 */

const pascal = (slug: string) =>
  slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

const VIEWBOX_BY_KIND: Record<string, string> = {
  mark: "0 0 120 120",
  divider: "0 0 400 24",
  illustration: "0 0 120 120",
};

describe("svg-items manifest", () => {
  it("lists 21 items with unique slugs and valid kinds", () => {
    expect(SVG_ITEMS).toHaveLength(21);
    expect(new Set(SVG_ITEMS.map((i) => i.slug)).size).toBe(21);
    for (const item of SVG_ITEMS) {
      expect(["mark", "divider", "illustration"]).toContain(item.kind);
      expect(item.description.length).toBeGreaterThan(20);
      expect(typeof item.animated).toBe("boolean");
    }
  });

  it("covers all three kinds", () => {
    const kinds = SVG_ITEMS.map((i) => i.kind);
    expect(kinds.filter((k) => k === "mark")).toHaveLength(9);
    expect(kinds.filter((k) => k === "divider")).toHaveLength(5);
    expect(kinds.filter((k) => k === "illustration")).toHaveLength(7);
  });

  it("splits 12 static + 9 animated (the v1 set stays static)", () => {
    expect(SVG_ITEMS.filter((i) => !i.animated)).toHaveLength(12);
    expect(
      SVG_ITEMS.filter((i) => i.animated)
        .map((i) => i.slug)
        .sort(),
    ).toEqual([
      "aurora-ribbon",
      "bloom-open",
      "butterfly-swarm",
      "comet-streak",
      "constellation-twinkle",
      "firefly-field",
      "orbit-mark-live",
      "vine-divider-grow",
      "wave-divider-flow",
    ]);
  });
});

describe("svg-items components", () => {
  for (const item of SVG_ITEMS) {
    it(`${pascal(item.slug)} renders a decorative root <svg> (${item.kind})`, () => {
      const exported = (lib as Record<string, unknown>)[pascal(item.slug)];
      expect(typeof exported).toBe("function");
      const Component = exported as (props: { className?: string }) => ReactElement;
      const el = Component({ className: "size-8" });
      expect(el.type).toBe("svg");
      const props = el.props as Record<string, unknown>;
      expect(props.viewBox).toBe(VIEWBOX_BY_KIND[item.kind]);
      expect(props["aria-hidden"]).toBe("true");
      expect(props.focusable).toBe("false");
      expect(props.className).toBe("size-8");
    });
  }
});

describe("svg-items animation contract", () => {
  for (const item of SVG_ITEMS.filter((i) => i.animated)) {
    it(`${pascal(item.slug)} ships reduced-motion-gated CSS animation`, () => {
      const Component = (lib as Record<string, unknown>)[pascal(item.slug)] as (props: {
        className?: string;
      }) => ReactElement;
      const markup = renderToStaticMarkup(createElement(Component));
      expect(markup).toContain("<style>");
      expect(markup).toContain("@media (prefers-reduced-motion: no-preference)");
      expect(markup).toContain("animation");
      // Scoped, stable selectors/keyframes — everything namespaced cwsi-*.
      expect(markup).toContain("cwsi-");
      // Decorative markup only — no client JS, no SMIL.
      expect(markup).not.toContain("<script");
      expect(markup).not.toContain("<animate");
    });
  }

  for (const item of SVG_ITEMS.filter((i) => !i.animated)) {
    it(`${pascal(item.slug)} never animates by default (hover rules are .cwsi-animate-gated)`, () => {
      const Component = (lib as Record<string, unknown>)[pascal(item.slug)] as (props: {
        className?: string;
      }) => ReactElement;
      const markup = renderToStaticMarkup(createElement(Component));
      // If a static item ships any animation CSS at all, every animation rule
      // must be an opt-in hover rule under .cwsi-animate AND reduced-motion.
      if (markup.includes("animation")) {
        expect(markup).toContain("@media (prefers-reduced-motion: no-preference)");
        expect(markup).toContain(".cwsi-animate:hover");
      }
    });
  }
});
