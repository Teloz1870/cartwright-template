import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY agent-facing surface must quote money in the reader's language.
 *
 * The defect this closes was found three times in three places, which is why
 * the guard is a sweep rather than three assertions. `agentMoney` falls back
 * to the CURRENCY's locale — da-DK for DKK — so any call that omits the
 * reader's locale answers an English shopper in Danish. On the live demo the
 * three tools on one page disagreed with each other:
 *
 *   search_products      DKK 149.00   (route, locale-aware)
 *   calculate_brew_ratio DKK 149.00 unit / 149,00 kr. subtotal
 *   get_cart             149,00 kr.   (and every cart mutation)
 *
 * The cart is the surface that matters most — it is the money on the way to
 * checkout — and it was the one left behind.
 *
 * This reads source rather than behaviour on purpose: the behavioural tests
 * each cover ONE call site, and the bug was always a call site nobody thought
 * to cover.
 *
 * What it does NOT do, stated plainly because the first version of this
 * docstring claimed otherwise ("a sweep cannot be outrun"):
 *  - It only sees INSIDE `agentMoney(...)`. A locale dropped ABOVE it — a
 *    caller omitting the argument it passes down — is invisible here. That is
 *    now a compile error instead (buildSummary's parameter is required), and
 *    a behavioural test covers the mutation path.
 *  - `SURFACES` is a hand-written list, not an enumeration. It now covers both
 *    formatters and all four known agent money surfaces, but a fifth file has
 *    to be added by hand.
 */
const SURFACES = [
  { file: "app/[locale]/cart/actions.ts", fn: "agentMoney" },
  { file: "app/api/products/search/route.ts", fn: "agentMoney" },
  // These format through `formatPrice`, not `agentMoney` — which is exactly
  // how they escaped the first version of this sweep. Their tools quote the
  // same prices the shopper is reading on the same page, so a locale-blind
  // call here puts the agent and the page into two different languages.
  { file: "components/webmcp/PlpWebMcpMount.tsx", fn: "formatPrice" },
  { file: "components/webmcp/PdpWebMcpMount.tsx", fn: "formatPrice" },
] as const;

/**
 * The CURRENCY half of the same sweep.
 *
 * `agentMoney` and the WebMCP mounts used to pin the shop's base currency by
 * documented design — correct while multiCurrency is off, because base IS the
 * charge currency then, and wrong the moment it is on: the page shows the
 * presentment amount, Stripe charges it, and only the agent still quoted base.
 * Same disagreement as the locale one, one axis over.
 */
describe("no agent-facing money is quoted in a currency the shop does not charge", () => {
  for (const { file, fn } of SURFACES) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const calls =
      source.match(new RegExp(`${fn}\\((?:[^()]|\\([^()]*\\))*\\)`, "g")) ?? [];

    it(`${file} passes a charge currency to every ${fn} call`, () => {
      const bare = calls.filter(
        (call) => !/currency|chargeCurrency/.test(call),
      );
      expect(
        bare,
        `${fn} calls with no currency in ${file}: ${bare.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("every surface resolves it from getCheckoutCurrency, not from config", () => {
    // The distinction that IS the fix: `brand.policies.currency` is what the
    // shop is denominated in; `getCheckoutCurrency()` is what this customer
    // will be charged. They differ only when the flag is on — which is exactly
    // when quoting the wrong one matters.
    for (const { file } of SURFACES) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, `${file} must resolve the charge currency`)
        .toContain("getCheckoutCurrency");
    }
  });
});

describe("no agent-facing money is formatted without the reader's locale", () => {
  for (const { file, fn } of SURFACES) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    // Balanced to ONE nesting level. `[^)]*` stopped at the first ")", so
    // `agentMoney(Math.max(x, 0))` matched as the fragment
    // `agentMoney(Math.max(x, 0)` — comma-bearing, therefore scored compliant,
    // while being a genuinely locale-less call. No current call has that
    // shape; the pattern should not depend on that staying true.
    const calls =
      source.match(new RegExp(`${fn}\\((?:[^()]|\\([^()]*\\))*\\)`, "g")) ?? [];

    it(`${file} calls ${fn} at all (else this passes vacuously)`, () => {
      expect(calls.length).toBeGreaterThan(0);
    });

    it(`${file} passes a locale to every ${fn} call`, () => {
      // Two arguments, i.e. a comma at the top level of the call.
      const bare = calls.filter((call) => !call.includes(","));
      expect(
        bare,
        `${fn} calls with no locale in ${file}: ${bare.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("the pattern would actually catch a bare call", () => {
    // Anti-vacuity: prove the regex and the comma test have teeth, so a
    // pattern that silently stops matching cannot read as "all clean".
    const sample = "unitPrice: agentMoney(unitMinor), total: agentMoney(x, locale),";
    const calls = sample.match(/agentMoney\([^)]*\)/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(calls.filter((c) => !c.includes(","))).toEqual(["agentMoney(unitMinor)"]);
  });
});
