"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/brand.config";
import { useFeature } from "@/lib/feature-flags/context";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";

export default function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  // WebMCP declarative form API: with the flag on, the form itself becomes
  // an agent tool (types/webmcp-dom.d.ts). Autosubmit is allowed — a search
  // is read-only navigation the user can trivially back out of. Flag off ⇒
  // no attributes ⇒ byte-identical markup. Tool-name namespace is shared
  // with the imperative tools; `site_search` cannot collide with them.
  const webMcp = useFeature("webMcp");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // FormData-FIRST: en WebMCP-agent udfylder DOM'en nativt og submitter før
    // React har synkroniseret controlled-state — closure-læsning ville se den
    // tomme startværdi. Flag-off har inputtet intet name (byte-identitet), så
    // FormData er tom dér og state-fallbacket bærer det menneskelige flow.
    const fromDom = new FormData(event.currentTarget).get("query");
    const query = (typeof fromDom === "string" ? fromDom : value).trim();
    if (query !== value) setValue(query); // sync controlled state (native fill)
    const native = event.nativeEvent as SubmitEvent;
    const agentInvoked = native.agentInvoked === true && typeof native.respondWith === "function";
    if (agentInvoked && !query) {
      // The tool schema marks `query` required, so an agent call without one
      // is refused with a reason — not quietly turned into "open the whole
      // catalogue". A HUMAN's empty search still opens the catalogue below.
      native.respondWith!(Promise.resolve({ error: "Provide a search query." }));
      return;
    }
    const target = query ? `/produkter?q=${encodeURIComponent(query)}` : "/produkter";
    if (agentInvoked) {
      // The agent gets the outcome instead of guessing from a navigation.
      native.respondWith!(Promise.resolve({ status: "navigating", query, path: target }));
    }
    router.push(target);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="relative w-52"
      {...(webMcp
        ? {
            toolname: WEBMCP_FORM_TOOL_NAMES.siteSearch,
            tooldescription:
              "Open this store's search results page so the user can see matching products. " +
              "This navigates the browser; to read product data without leaving the page, use search_products instead.",
            toolautosubmit: "",
            // `required` on the input is what puts `query` into the tool's
            // derived inputSchema.required (the declarative API reads the
            // attribute; there is no other way to say it). noValidate is its
            // partner on THIS form because the agent submits it (autosubmit):
            // a browser that submits through requestSubmit() runs constraint
            // validation first, and an empty required query would cancel the
            // submit event outright — native Chrome then hands the agent a
            // bare "Form validation failed" instead of the page's own answer.
            // (The polyfill dispatches a synthetic submit event, which skips
            // validation, so it was never blocked; the risk is native.)
            // With noValidate the requirement is enforced in handleSubmit
            // instead, which tells the agent what was missing. The search
            // input carries no other constraint, so no validation a human had
            // is lost.
            noValidate: true,
          }
        : {})}
    >
      <label htmlFor="site-search" className="sr-only">
        {brand.uiLabels.searchAria}
      </label>
      <input
        id="site-search"
        type="search"
        // WebMCP: den deklarative API syntetiserer tool-skemaet fra NAVNGIVNE
        // kontroller — uden name har site_search ingen parametre en agent kan
        // udfylde. Flag-gated så flag-off-markup er byte-identisk.
        {...(webMcp
          ? { name: "query", required: true, toolparamdescription: "Free-text product search." }
          : {})}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={brand.uiLabels.searchPlaceholder}
        className="w-full rounded-full border border-sol-ink/15 dark:border-white/15 bg-white dark:bg-sol-sand py-2 pl-9 pr-3 text-sm text-sol-ink placeholder:text-sol-muted outline-none transition focus:border-sol-accent focus:ring-2 focus:ring-sol-accent/20"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sol-muted"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </form>
  );
}
