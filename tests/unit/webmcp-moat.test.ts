import { describe, expect, it } from "vitest";
import { CUSTOMER_TOOL_ALLOWLIST, isCustomerTool } from "@/lib/ai/client";
import { WEBMCP_TOOL_BINDINGS } from "@/components/WebMcpRegistrar";
import { PDP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PdpWebMcpTools";
import { CART_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/CartWebMcpTools";
import { PLP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PlpWebMcpTools";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";
import { DESIGN_OPTIONS, getDesign } from "@/designs";

/**
 * The moat, applied to the WebMCP surface (same negative-enforcement style as
 * admin-chat-isolation.test.ts): build/compose power lives on the admin + MCP
 * surface — the in-browser agent surface stays CART/CATALOGUE ONLY.
 *
 * WebMCP tools are hand-written client-side descriptors that do NOT pass
 * through lib/tools/registry, so nothing structural stops someone from
 * registering a `design.set_slug` tool in the browser. This test is that
 * stop: every WebMCP tool must declare which CUSTOMER_TOOL_ALLOWLIST
 * operations it maps to, and every declared operation must actually be
 * customer-safe. The registrar test closes the other half of the loop by
 * asserting the REGISTERED tool names equal the binding keys — so a tool
 * cannot ship unregistered in the bindings, and a binding cannot claim an
 * operation the moat does not allow.
 *
 * DECLARATIVE CARVE-OUT: the form tools (site_search, contact_store,
 * newsletter_signup — WEBMCP_FORM_TOOL_NAMES) carry NO bindings by design.
 * They are the human's own forms submitted through the same public
 * endpoints, with the human confirming (no autosubmit on communication) —
 * so contact/newsletter sit OUTSIDE the products./cart. families without
 * weakening the rule the bindings enforce: no NEW data operation reaches
 * the browser surface without a customer-allowlisted binding. Their names
 * still participate in the global-uniqueness check below.
 *
 * Honest limit: bindings are DECLARATIONS. Nothing statically ties an
 * execute() body to its declared operation — the registrar test pins
 * add_to_cart's body to addToCartAction and navigate's refusal, but a
 * future edit could re-point a read tool's fetch while its binding still
 * reads "products.search". Name-level enforcement is the cheap 90%; body
 * pinning for the read tools is a welcome follow-up, not a substitute.
 *
 * Pure navigation tools bind to [] — they perform no data operation at all.
 * An EMPTY binding is only legitimate for those; a data tool with [] would
 * dodge the check, so the shape of each binding is asserted explicitly.
 */

// Tools whose only effect is same-origin browser navigation. filter_products
// belongs here: it validates input against a server-derived whitelist and
// then only navigates to /{locale}/produkter?… — same effect class as
// `navigate`, just schema-shaped.
const NAVIGATION_ONLY = new Set(["navigate", "go_to_checkout", "filter_products"]);

// The third documented []-class (mirroring the declarative carve-out's
// spirit): PURE page-local computation — no data operation, no navigation,
// no network. crema's calculate_brew_ratio is brew-math.ts arithmetic the
// human already gets as a widget. The enumeration is review-gated: a new
// pack tool that wants [] must be argued into one of these two sets.
const PURE_COMPUTE = new Set(["calculate_brew_ratio"]);

// DESIGN PACKS are WebMCP surfaces too (crema mounts calculate_brew_ratio
// from its homepage): aggregate every REGISTERED pack's declared bindings.
// Iterating the DESIGNS map via the public catalogue means a pack pruned by
// a CLI profile drops out automatically (the prune codemods designs/index.ts).
const PACK_BINDINGS: Record<string, readonly string[]> = {};
let packBindingCount = 0;
for (const option of DESIGN_OPTIONS) {
  const pack = getDesign(option.slug);
  for (const [name, ops] of Object.entries(pack?.webMcpToolBindings ?? {})) {
    PACK_BINDINGS[name] = ops;
    packBindingCount += 1;
  }
}

/** Every WebMCP surface's bindings — global registrar + per-page mounts + packs. */
const ALL_BINDINGS: Record<string, readonly string[]> = {
  ...WEBMCP_TOOL_BINDINGS,
  ...PDP_WEBMCP_TOOL_BINDINGS,
  ...CART_WEBMCP_TOOL_BINDINGS,
  ...PLP_WEBMCP_TOOL_BINDINGS,
  ...PACK_BINDINGS,
};

describe("WebMCP moat — the in-browser surface is cart/catalogue only", () => {
  const bindings = Object.entries(ALL_BINDINGS) as [string, readonly string[]][];

  it("has at least the core tool set (the check cannot pass on an empty object)", () => {
    expect(bindings.length).toBeGreaterThanOrEqual(8);
  });

  it("tool names are globally UNIQUE across all surfaces — duplicate behavior is undefined in the draft", () => {
    const perSet =
      Object.keys(WEBMCP_TOOL_BINDINGS).length +
      Object.keys(PDP_WEBMCP_TOOL_BINDINGS).length +
      Object.keys(CART_WEBMCP_TOOL_BINDINGS).length +
      Object.keys(PLP_WEBMCP_TOOL_BINDINGS).length +
      packBindingCount;
    // A name collision would collapse keys in the spread above.
    expect(Object.keys(ALL_BINDINGS).length).toBe(perSet);
    // The DECLARATIVE form tools share the namespace: none of their names
    // may collide with a registered tool (or each other).
    const formNames = Object.values(WEBMCP_FORM_TOOL_NAMES);
    expect(new Set(formNames).size).toBe(formNames.length);
    for (const name of formNames) {
      expect(name in ALL_BINDINGS, `${name} collides with a registered tool`).toBe(false);
    }
  });

  it("every bound operation is in CUSTOMER_TOOL_ALLOWLIST", () => {
    for (const [tool, ops] of bindings) {
      for (const op of ops) {
        expect(
          isCustomerTool(op),
          `${tool} maps to "${op}", which is NOT a customer-safe operation`,
        ).toBe(true);
      }
    }
  });

  it("only navigation-only and pure-compute tools may bind to [] — a data tool cannot dodge the check", () => {
    for (const [tool, ops] of bindings) {
      if (NAVIGATION_ONLY.has(tool) || PURE_COMPUTE.has(tool)) {
        expect(ops, `${tool} performs no data operation`).toEqual([]);
      } else {
        expect(ops.length, `${tool} must declare its operations`).toBeGreaterThan(0);
      }
    }
  });

  it("pack-registered tools are declared (crema's brew tool is aggregated, not invisible)", () => {
    // The aggregation cannot silently go empty while a pack still mounts a
    // tool — crema is the reference implementation of the pattern.
    expect(PACK_BINDINGS).toHaveProperty("calculate_brew_ratio");
    expect(getDesign("crema")?.webMcpToolBindings).toBeDefined();
  });

  it("never binds an operation outside the cart/catalogue families", () => {
    // Belt and braces on top of isCustomerTool: even within the customer
    // allowlist, the BROWSER surface stays narrower — no order creation, no
    // customer lookups, no UI presentation from a WebMCP tool.
    const allowedPrefixes = ["products.", "cart."];
    for (const [tool, ops] of bindings) {
      for (const op of ops) {
        expect(
          allowedPrefixes.some((p) => op.startsWith(p)),
          `${tool} binds "${op}" — outside the WebMCP families (${allowedPrefixes.join(", ")})`,
        ).toBe(true);
      }
    }
  });

  it("the allowlist itself still contains the operations the bindings lean on", () => {
    // If the allowlist ever renames cart.add/cart.get_summary etc., the
    // bindings must be revisited rather than silently pointing at nothing.
    for (const op of [
      "products.search",
      "cart.add",
      "cart.get_summary",
      "cart.update_quantity",
      "cart.remove",
    ]) {
      expect(CUSTOMER_TOOL_ALLOWLIST).toContain(op);
    }
  });
});
