import { describe, expect, it } from "vitest";

import { isEngineCheckout, lineOf, onDisk, read, stripComments, subdirs, walkCode } from "../guards/_shared";

/**
 * MONEY1: a line's unit price has one definition, `unitPriceDkk` in
 * lib/pricing.ts. The rule used to be written out at 22 places in the money
 * path, under whatever the locals were called (i, item, selectedVariant), so the
 * next change to it (a before-price, an option delta) had 22 places to land and
 * 22 chances to miss one. This fails if a file in WALKED writes it out again.
 *
 * It walks the disk and reads only what exists: tests/unit ships into customer
 * scaffolds, which have no git and may have modules pruned.
 */

const WALKED = ["app", "lib", "components", "plugins", "designs", "scripts", "prisma"];
const HOME = "lib/pricing.ts";
// Fixtures, notes (internal-docs holds whole replayed projects) and build output.
const NOT_SOURCE = new Set(["tests", "internal-docs", "out"]);

const OR = String.raw`\s*(?:\?\?|\|\|)\s*`;
// A property chain: i.variant, product.variants?.[0].
const CHAIN = String.raw`[\w.?[\]]*`;
// A price read only to test it is not the rule: `!v.priceDkk || ...`, `x !== v.priceDkk || ...`,
// `x > v.priceDkk || ...`. The `>` of an arrow opens a value, so it is not one of these.
const NOT_TESTED = String.raw`(?<!(?:!|[=!<>]=|<|(?<!=)>)\s*${CHAIN})`;
// Nor is a product's own, under the names this codebase gives a product, or an aggregate's,
// which is the "from" price: product?.priceDkk ?? defaultPriceDkk.
const NOT_A_PRODUCT = String.raw`(?<!(?:product\w*|\bp(?:rod)?|_m(?:in|ax))\s*)`;
// Nor is what follows a fallback to another price when it is any of these. The
// leading \s* is this lookahead's own: OR's can back off, and the check must not
// then pass by looking at the space.
const A_FALLBACK = String.raw`(?!\s*(?:${[
  String.raw`(?:null|undefined|Infinity)\b|-?\d|["'\x60]`, // a literal default: ?? null
  // the variant again, not another price: ?? variant.compareAtDkk, || hasVariants
  String.raw`${CHAIN}variant(?:\??\.(?!price)|(?!${CHAIN}price))`,
  String.raw`${CHAIN}unitPriceDkk`, // the function, or a stored line's snapshot: ?? unitPriceDkk(i)
  String.raw`!`, // a negation: || !product.active
  String.raw`${CHAIN}\s*(?:[<>]|[=!]=)`, // a comparison: || n > 0
].join("|")}))`;

const INLINE_RULE = [
  // i.variant?.priceDkk ?? i.product.priceDkk, and `||`, whatever the local is called
  new RegExp(String.raw`${NOT_TESTED}\w*variant\w*\s*\??\.\s*priceDkk${OR}${A_FALLBACK}`, "gi"),
  // v?.priceDkk ?? i.product.priceDkk, when the local gives no clue. The fallback has to name
  // a price then, in any case and any unit, or nothing says this is the rule.
  new RegExp(String.raw`${NOT_TESTED}${NOT_A_PRODUCT}\?\.priceDkk${OR}${A_FALLBACK}${CHAIN}price`, "gi"),
  // i.variant ? i.variant.priceDkk : i.product.priceDkk
  new RegExp(String.raw`\w*variant\w*\s*\?\s*[\w.]*variant\w*\s*\.\s*priceDkk\s*:\s*${A_FALLBACK}`, "gi"),
  // (i.variant ?? i.product).priceDkk
  /\(\s*[\w.]*variant\w*\s*(?:\?\?|\|\|)\s*[\w.]*product\w*\s*\)\s*\.\s*priceDkk/gi,
];

/** The 1-based lines that write the rule out. A comment that names it does not. */
function inlineRuleLines(source: string): number[] {
  const src = stripComments(source);
  const lines = INLINE_RULE.flatMap((pattern) =>
    [...src.matchAll(pattern)].map((match) => lineOf(src, match.index)),
  );
  return [...new Set(lines)];
}

const FILES = WALKED.flatMap((dir) => walkCode(dir));

describe("a line's unit price is written once", () => {
  it("no file outside lib/pricing.ts writes the rule out", () => {
    const offenders = FILES.filter((file) => file !== HOME).flatMap((file) =>
      inlineRuleLines(read(file)).map((line) => `${file}:${line}`),
    );

    expect(offenders, "call unitPriceDkk from lib/pricing.ts instead").toEqual([]);
  });

  it("the walk reaches real source files", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  // A root left off WALKED is a root this cannot see, which is how designs/ went
  // unread. Engine only: a customer's own directories are theirs to name.
  it.skipIf(!isEngineCheckout())("every directory that reads a price is walked", () => {
    const unwalked = subdirs(".").filter(
      (dir) => !dir.startsWith(".") && !WALKED.includes(dir) && !NOT_SOURCE.has(dir),
    );
    const readers = unwalked
      .flatMap((dir) => walkCode(dir))
      .filter((file) => /\.priceDkk\b/.test(stripComments(read(file))));

    expect(readers, "add the directory to WALKED, or to NOT_SOURCE if it is not source").toEqual([]);
  });

  it.skipIf(!onDisk(HOME))("the matcher sees the rule where it lives, so it is not blind", () => {
    expect(FILES).toContain(HOME);
    expect(inlineRuleLines(read(HOME))).not.toEqual([]);
  });
});

describe("what counts as writing the rule out", () => {
  it.each([
    "i.variant?.priceDkk ?? i.product.priceDkk",
    "item.variant?.priceDkk ?? item.product.priceDkk",
    "line.variant?.priceDkk ?? line.product.priceDkk",
    "selectedVariant?.priceDkk ?? basePriceDkk",
    "variant?.priceDkk || product.priceDkk",
    "i.variant\n  ?.priceDkk\n  ?? i.product.priceDkk",
    "v?.priceDkk ?? item.product.priceDkk",
    "i.variant ? i.variant.priceDkk : i.product.priceDkk",
    "(i.variant ?? i.product).priceDkk",
    "product.variants?.[0]?.priceDkk ?? product.priceDkk",
    "const unit = selectedVariant?.priceDkk ?? basePriceDkk;",
    "total += selectedVariant?.priceDkk ?? basePriceDkk;",
    "items.map((i) => i.variant?.priceDkk ?? basePriceDkk)",
    "<Price oere={variant?.priceDkk ?? product.priceDkk} />",
    "variant?.priceDkk ?? fallback",
    "selectedVariant?.priceDkk ?? fallback",
    "productVariant?.priceDkk ?? product.priceDkk",
    "variant?.priceDkk ?? nullableBase",
    "variant?.priceDkk ?? (product.priceDkk)",
    "variant && variant.priceDkk || product.priceDkk",
    "selectedVariant ? selectedVariant.priceDkk : basePriceDkk",
    "i.variant?.priceDkk ?? i.product.priceDkk // the rule",
    // A `/*` that opens no comment must not hide the code below it.
    "// lib/search/* is lazy\ni.variant?.priceDkk ?? i.product.priceDkk\n/** next */",
    `const accept = "image/*";\ni.variant?.priceDkk ?? i.product.priceDkk\n/** next */`,
    // A local that gives no clue, when the fallback names a price, in any case and any unit.
    "v?.priceDkk ?? basePriceDkk",
    "selected\n  ?.priceDkk\n  ?? basePriceDkk",
    "v?.priceDkk || basePriceDkk",
    "opt?.priceDkk ?? fallbackPriceDkk",
    "v?.priceDkk ?? basePrice",
    "v?.priceDkk ?? unitPrice",
    "v?.priceDkk ?? p?.priceDkk",
    "v?.priceDkk ?? items[0].priceDkk",
    "top?.priceDkk ?? basePriceDkk",
    "product.variants.find((x) => x.id === id)?.priceDkk ?? basePriceDkk",
    // A fallback that only mentions a variant is still another price.
    "selectedVariant?.priceDkk ?? minVariantPrice",
    "selectedVariant ? selectedVariant.priceDkk : minVariantPrice",
    "variant?.priceDkk ?? product.defaultVariantPriceDkk",
    "selectedVariant?.priceDkk ?? defaultVariant.priceDkk",
    "selectedVariant?.priceDkk ?? product.variants[0].priceDkk",
    // An arrow opens a value, and the rule in a comparison's brackets or a branch is still the rule.
    "items.map((i)=>i.variant?.priceDkk ?? basePriceDkk)",
    "variants.map((v) => v?.priceDkk ?? basePriceDkk)",
    "if (a.priceDkk > (variant?.priceDkk ?? product.priceDkk))",
    "a < b ? variant?.priceDkk ?? product.priceDkk : 0",
  ])("%s does", (code) => {
    expect(inlineRuleLines(code)).not.toEqual([]);
  });

  it.each([
    "unitPriceDkk(i)",
    "unitPriceDkk: variant.priceDkk,",
    "i.variant?.stock ?? i.product.stock",
    "range?._min?.priceDkk ?? null",
    "range._min?.priceDkk != null",
    "product.compareAtDkk ?? product.priceDkk",
    "hasVariants ? Math.min(...product.variants.map((v) => v.priceDkk)) : product.priceDkk",
    "product?.priceDkk ?? defaultPriceDkk",
    // A default is not the product's price.
    "variant?.priceDkk ?? null",
    "variant?.priceDkk ?? undefined",
    "variant?.priceDkk ?? 0",
    "variant?.priceDkk || -1",
    `variant?.priceDkk ?? ""`,
    "variant?.priceDkk ?? ''",
    "variant?.priceDkk ?? `-`",
    "Math.min(a, variant?.priceDkk ?? Infinity)",
    "variant ? variant.priceDkk : null",
    "variant ? variant.priceDkk : 0",
    // Nor is the variant read again.
    "variant?.priceDkk ?? variant.compareAtPriceDkk",
    "i.variant?.priceDkk ?? i.variant?.compareAtPriceDkk",
    "variant?.priceDkk ?? variant.beforePriceDkk",
    "if (variant.priceDkk || variants.length)",
    "if (variant.priceDkk || hasVariants)",
    // A test is not a price.
    "if (!variant.priceDkk || variant.priceDkk < 0)",
    "if (!variant.priceDkk || !product.active)",
    "if (!i.variant?.priceDkk || product.archived)",
    "if (!v?.priceDkk || v.priceDkk < 0)",
    "if (!product?.priceDkk || product.priceDkk < 0)",
    "if (variant.priceDkk || !product.active)",
    "if (variant.priceDkk || product.priceDkk > 0)",
    "if (variant.priceDkk || product.stock === 0)",
    "if (a.priceDkk !== variant.priceDkk || a.stock !== variant.stock)",
    "if (a.priceDkk !== variant.priceDkk || a.active)",
    "if (a.priceDkk != variant.priceDkk || a.active)",
    "if (a.priceDkk >= variant.priceDkk || a.active)",
    "if (a.priceDkk <= variant.priceDkk || a.active)",
    "if (minPrice < variant.priceDkk || product.archived)",
    "if (maxPrice > i.variant?.priceDkk || i.product.archived)",
    "if (a.priceDkk > variant.priceDkk || a.active)",
    "if (a.priceDkk < variant.priceDkk || a.active)",
    "if (!v?.priceDkk || product.priceDkk)",
    "if (a.priceDkk !== v?.priceDkk || b.priceDkk)",
    "if (a.priceDkk > v?.priceDkk || b.priceDkk)",
    "if (a.priceDkk < v?.priceDkk || b.priceDkk)",
    "if (!product.variants?.[0]?.priceDkk || product.priceDkk)",
    "if (a.priceDkk > items[0].variant.priceDkk || a.active)",
    "if (variant.priceDkk || items[0].stock > 0)",
    // With no clue on either side, nothing says it is the rule.
    "v?.priceDkk ?? fallback",
    // A product's own price is not, under the names this codebase gives one, nor an aggregate's.
    "product?.priceDkk ?? defaultProduct.priceDkk",
    "product\n  ?.priceDkk ?? defaultPriceDkk",
    "selectedProduct?.priceDkk ?? defaultPriceDkk",
    "productRow?.priceDkk ?? defaultPriceDkk",
    "p?.priceDkk ?? defaultPriceDkk",
    "prod?.priceDkk ?? defaultPriceDkk",
    "range?._min?.priceDkk ?? fallbackPriceDkk",
    "range?._max?.priceDkk ?? product.priceDkk",
    // Nor is the function itself, or a stored line's snapshot.
    "override?.priceDkk ?? unitPriceDkk(line)",
    "item.variant?.priceDkk ?? item.unitPriceDkk",
    // A comment that names the rule does not write it.
    "// the ACP branch has no variant?.priceDkk ?? product.priceDkk",
    "const a = 1; // v?.priceDkk ?? item.product.priceDkk",
    "/* variant?.priceDkk ?? product.priceDkk */",
    "{/* i.variant ? i.variant.priceDkk : i.product.priceDkk */}",
    "/**\n * (i.variant ?? i.product).priceDkk\n */",
  ])("%s does not", (code) => {
    expect(inlineRuleLines(code)).toEqual([]);
  });

  it("names the line the rule is on, below any comment", () => {
    expect(inlineRuleLines("/**\n * a\n */\n// b\ni.variant?.priceDkk ?? i.product.priceDkk")).toEqual([5]);
  });
});
