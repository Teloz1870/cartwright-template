"use client";

import { useState } from "react";

/**
 * Intent-first tool explorer for /webmcp-check: pick what you WANT to do →
 * get the exact tool, where it registers, and a copyable example input.
 * The genre homage is deliberate — sdras/array-explorer taught a generation
 * that "find the method you need" beats reading an API list top to bottom;
 * this applies the same idea to a storefront's agent tools.
 *
 * The examples are illustrative INPUTS (the live schemas are built per page
 * from real products/cart lines — open the tool in Chrome DevTools >
 * Application > WebMCP to see today's schema and run it for real).
 */

type Intent = {
  intent: string;
  tool: string;
  where: string;
  example: Record<string, unknown>;
  note?: string;
};

const INTENTS: Intent[] = [
  {
    intent: "Find a product",
    tool: "search_products",
    where: "any page",
    example: { query: "ethiopia", limit: 5 },
  },
  {
    intent: "See what's on the shelf",
    tool: "list_visible_products",
    where: "catalogue page",
    example: {},
    note: "Returns exactly the server-narrowed list the human sees — zero network.",
  },
  {
    intent: "Narrow the shelf",
    tool: "filter_products",
    where: "catalogue page",
    example: { category: "beans", sort: "price-asc" },
    note: "The schema's category enum is server-derived from the live categories.",
  },
  {
    intent: "Add this product to the cart",
    tool: "add_current_product_to_cart",
    where: "product page",
    example: { variant: "Whole beans, 250 g", quantity: 1 },
    note: "Variants are natural-language option names — the enum lists today's real options.",
  },
  {
    intent: "Check the cart",
    tool: "get_cart",
    where: "any page",
    example: {},
  },
  {
    intent: "Change a quantity",
    tool: "update_cart_item_quantity",
    where: "cart page",
    example: { cartItemId: "…", quantity: 2 },
    note: "The schema enumerates the live line ids.",
  },
  {
    intent: "Remove a line",
    tool: "remove_cart_item",
    where: "cart page",
    example: { cartItemId: "…" },
  },
  {
    intent: "Head to checkout",
    tool: "go_to_checkout",
    where: "cart page",
    example: {},
    note: "Opens the page. The purchase itself stays the human's — no order-placing tool exists in this browser.",
  },
  {
    intent: "Go somewhere",
    tool: "navigate",
    where: "any page",
    example: { path: "/produkter?q=oak" },
  },
];

export default function WebMcpIntentPicker({
  packIntents = [],
}: {
  packIntents?: Intent[];
}) {
  const intents = [...INTENTS, ...packIntents];
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = intents[active];
  const exampleJson = JSON.stringify(current.example, null, 2);

  return (
    <div className="mt-4 rounded-lg border border-current/15 p-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="I want to…">
        {intents.map((item, index) => (
          <button
            key={item.intent}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => {
              setActive(index);
              setCopied(false);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              index === active
                ? "border-current/60 font-semibold"
                : "border-current/20 opacity-70 hover:opacity-100"
            }`}
          >
            {item.intent}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm">
        <p>
          <code className="font-mono font-semibold">{current.tool}</code>{" "}
          <span className="text-xs opacity-60">— registers on: {current.where}</span>
        </p>
        {current.note ? <p className="mt-1 text-xs opacity-70">{current.note}</p> : null}
        <div className="mt-3 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-current/10 p-3 text-xs leading-5">
            <code>{exampleJson}</code>
          </pre>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(exampleJson).then(() => setCopied(true));
            }}
            className="shrink-0 rounded-md border border-current/25 px-2.5 py-1.5 text-xs font-medium hover:border-current/50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs opacity-60">
          Example input — the live schema is built from this page&apos;s real data. Run it
          in Chrome DevTools → Application → WebMCP, or ask an agent.
        </p>
      </div>
    </div>
  );
}
