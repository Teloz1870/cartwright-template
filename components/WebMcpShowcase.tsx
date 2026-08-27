"use client";

import WebMcpCheck from "@/components/WebMcpCheck";
import { WEBMCP_TOOL_BINDINGS } from "@/components/WebMcpRegistrar";
import { PDP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PdpWebMcpTools";
import { CART_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/CartWebMcpTools";
import { PLP_WEBMCP_TOOL_BINDINGS } from "@/components/webmcp/PlpWebMcpTools";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";

/**
 * The judge-facing WebMCP inventory for /webmcp-check: every tool this
 * storefront can register, grouped by the surface that registers it, built
 * by importing THE SAME binding consts the moat test verifies — so this
 * page structurally cannot claim a tool that doesn't exist or hide one
 * that does. ("use client" because the binding consts live in client
 * modules; the component still server-renders its static markup.)
 *
 * Pack tools are passed in from the server (the active design's
 * webMcpToolBindings) — only the ACTIVE pack's tools are real on this shop.
 */

type Surface = {
  title: string;
  note: string;
  tools: { name: string; binds: readonly string[] }[];
};

const toolRows = (bindings: Readonly<Record<string, readonly string[]>>) =>
  Object.entries(bindings).map(([name, binds]) => ({ name, binds }));

export default function WebMcpShowcase({
  packBindings,
  packName,
}: {
  packBindings: Readonly<Record<string, readonly string[]>>;
  packName: string | null;
}) {
  const surfaces: Surface[] = [
    {
      title: "Site-wide (every page)",
      note: "Registered by the storefront layout the moment any page loads.",
      tools: toolRows(WEBMCP_TOOL_BINDINGS),
    },
    {
      title: "Catalogue page (contextual)",
      note: "The listing page teaches the agent its own filters — the visible product set and a schema built from the live categories.",
      tools: toolRows(PLP_WEBMCP_TOOL_BINDINGS),
    },
    {
      title: "Product page (contextual)",
      note: "The PDP sells its own product: the tool description carries the page's name, price, variants and stock.",
      tools: toolRows(PDP_WEBMCP_TOOL_BINDINGS),
    },
    {
      title: "Cart page (contextual)",
      note: "Line-level editing with verifiable returns — every mutation answers with the fresh cart.",
      tools: toolRows(CART_WEBMCP_TOOL_BINDINGS),
    },
    {
      title: "Declarative forms",
      note: "The forms themselves are the tools (toolname/tooldescription attributes + SubmitEvent.respondWith). Autosubmit only on read-only search; the human confirms communication.",
      tools: Object.values(WEBMCP_FORM_TOOL_NAMES).map((name) => ({
        name,
        binds: [] as readonly string[],
      })),
    },
    ...(Object.keys(packBindings).length > 0
      ? [
          {
            title: `Design pack${packName ? ` — ${packName}` : ""}`,
            note: "The active design ships its own tools: a page capability the human uses as a widget, typed for agents from the same math.",
            tools: toolRows(packBindings),
          },
        ]
      : []),
  ];

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="webmcp-tools-heading">
        <h2 id="webmcp-tools-heading" className="text-lg font-semibold">
          Tools on this storefront
        </h2>
        <p className="mt-1 text-sm opacity-80">
          Contextual tools appear and disappear as you navigate — keep this page open in a
          second tab, browse the shop, and watch the live list below change.
        </p>
        <div className="mt-4 space-y-5">
          {surfaces.map((s) => (
            <div key={s.title} className="rounded-lg border border-current/15 p-4">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-xs opacity-70">{s.note}</p>
              <ul className="mt-3 space-y-1.5">
                {s.tools.map((tool) => (
                  <li key={tool.name} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <code className="font-mono">{tool.name}</code>
                    <span className="text-xs opacity-60">
                      {tool.binds.length > 0
                        ? `→ ${tool.binds.join(", ")}`
                        : "no data operation (navigation / pure compute / human-confirmed form)"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="webmcp-moat-heading">
        <h2 id="webmcp-moat-heading" className="text-lg font-semibold">
          The safety moat
        </h2>
        <p className="mt-2 text-sm leading-6 opacity-80">
          Every registered tool declares which customer-safe operation it maps to, and a unit
          test holds the whole browser surface to the <code>products.*</code> /{" "}
          <code>cart.*</code> families — across the layout, the per-route mounts and design
          packs. <strong>No order-placing tool exists in this browser.</strong> Checkout is
          deliberately tool-free: <code>go_to_checkout</code> only opens the page, and the
          purchase stays the human&apos;s. Every cart mutation returns the fresh cart so an
          agent can verify what actually happened instead of assuming.
        </p>
      </section>

      <section aria-labelledby="webmcp-setup-heading">
        <h2 id="webmcp-setup-heading" className="text-lg font-semibold">
          Try it yourself
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 opacity-80">
          <li>
            <strong>ChatGPT desktop app</strong>: open this site in the built-in browser and
            ask ChatGPT to use the shop — WebMCP is supported natively.
          </li>
          <li>
            <strong>Chrome 146+</strong>: enable{" "}
            <code>chrome://flags/#enable-webmcp-testing</code> and reload (Chrome 149+ can
            also run it via an origin trial, no flag needed).
          </li>
          <li>
            <strong>WebMCP Inspector</strong> (Chrome DevTools extension): shows every tool
            registered on the current page and lets you invoke them with custom input.
          </li>
        </ul>
      </section>

      <section aria-labelledby="webmcp-live-heading">
        <h2 id="webmcp-live-heading" className="text-lg font-semibold">
          Live check — this browser, this page
        </h2>
        <WebMcpCheck />
      </section>
    </div>
  );
}
