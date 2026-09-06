import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import WebMcpShowcase from "@/components/WebMcpShowcase";
import { WEBMCP_TOOL_BINDINGS } from "@/components/WebMcpRegistrar";
import { PDP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PdpWebMcpTools";
import { CART_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/CartWebMcpTools";
import { PLP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PlpWebMcpTools";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";

/**
 * /webmcp-check's inventory is built by importing the SAME binding consts the
 * moat test verifies — this render pin closes the loop: every tool the moat
 * knows appears on the page, and the pack section only exists when the
 * active design actually ships tools. The page structurally cannot lie, and
 * this test is what keeps that sentence true.
 */
describe("WebMcpShowcase — the judge-facing inventory", () => {
  const allImperativeNames = [
    ...Object.keys(WEBMCP_TOOL_BINDINGS),
    ...Object.keys(PLP_WEBMCP_TOOL_BINDINGS),
    ...Object.keys(PDP_WEBMCP_TOOL_BINDINGS),
    ...Object.keys(CART_WEBMCP_TOOL_BINDINGS),
  ];

  it("lists every moat-verified tool plus the declarative form tools", () => {
    const html = renderToStaticMarkup(
      <WebMcpShowcase packBindings={{}} packName={null} />,
    );
    for (const name of allImperativeNames) {
      expect(html).toContain(`<code class="font-mono">${name}</code>`);
    }
    for (const name of Object.values(WEBMCP_FORM_TOOL_NAMES)) {
      expect(html).toContain(`<code class="font-mono">${name}</code>`);
    }
    // The moat's headline commitment is stated verbatim.
    expect(html).toContain("No order-placing tool exists in this browser.");
    // No pack section without pack tools.
    expect(html).not.toContain("Design pack");
  });

  it("shows the active pack's tools only when the design ships them", () => {
    const html = renderToStaticMarkup(
      <WebMcpShowcase
        packBindings={{ calculate_brew_ratio: [] }}
        packName="Crema (cinematic dark roast)"
      />,
    );
    expect(html).toContain("Design pack — Crema (cinematic dark roast)");
    expect(html).toContain("calculate_brew_ratio");
  });

  it("renders each tool's binding — or the honest no-data-operation label", () => {
    const html = renderToStaticMarkup(
      <WebMcpShowcase packBindings={{}} packName={null} />,
    );
    expect(html).toContain("→ cart.add");
    expect(html).toContain("→ products.search");
    expect(html).toContain("no data operation");
  });
});

describe("the intent picker", () => {
  it("offers the core intents with copyable examples, pack intent only with the pack", () => {
    const bare = renderToStaticMarkup(
      <WebMcpShowcase packBindings={{}} packName={null} />,
    );
    expect(bare).toContain("I want to…");
    expect(bare).toContain("Find a product");
    expect(bare).toContain("Add this product to the cart");
    // Only the ACTIVE intent's example renders server-side — the first one.
    expect(bare).toContain("ethiopia");
    expect(bare).not.toContain("Get a brew recipe");

    const withPack = renderToStaticMarkup(
      <WebMcpShowcase
        packBindings={{ calculate_brew_ratio: [] }}
        packName="Crema"
      />,
    );
    expect(withPack).toContain("Get a brew recipe");
  });
});
