import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PII_MAP } from "@/lib/gdpr/pii-map";

/**
 * lib/gdpr/pii-map.ts is the checklist gdpr.erase_user is held against, and a
 * checklist only works if a new column cannot slip past it. Order is where that
 * has happened: its billing columns arrived days after `erase.ts` was written,
 * and it never learned them. So every Order column must be classified, as erased
 * or as kept, and a column nobody classified turns this red the day it lands in
 * the schema.
 *
 * The columns come from the text of prisma/schema.prisma: a field typed by
 * another model is a relation, and everything else is a column.
 */

const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
const MODELS = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));

function columns(model: string): string[] {
  const body = new RegExp(`^model ${model} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
  if (!body) throw new Error(`no model ${model} in prisma/schema.prisma`);
  return [...body.matchAll(/^\s+(\w+)\s+(\w+)/gm)].filter((m) => !MODELS.has(m[2])).map((m) => m[1]);
}

const spec = (model: string) => {
  const found = PII_MAP.find((m) => m.model === model);
  if (!found) throw new Error(`no ${model} in PII_MAP`);
  return found;
};
const order = spec("Order");
const kept = order.fields.filter((f) => f.strategy === "keep").map((f) => f.field);
const erased = order.fields.filter((f) => f.strategy !== "keep").map((f) => f.field);

describe("the schema walk reads what it claims to", () => {
  it("finds Order's columns and leaves its relations out", () => {
    const cols = columns("Order");
    expect(cols).toEqual(expect.arrayContaining(["id", "email", "billingName", "totalDkk", "cvr", "ean", "reference"]));
    for (const relation of ["user", "items", "fulfillmentOrders", "reviews", "notes", "returns"]) {
      expect(cols).not.toContain(relation);
    }
    // The block attributes and comments between the fields are not columns.
    expect(cols).not.toContain("unique");
    expect(cols.length).toBeGreaterThan(40);
  });
});

describe("every Order column is classified", () => {
  it("a column on neither list is red", () => {
    const classified = new Set([...kept, ...erased]);
    expect(columns("Order").filter((c) => !classified.has(c))).toEqual([]);
  });

  it("the map names no column that is gone, and none twice", () => {
    const cols = new Set(columns("Order"));
    expect(order.fields.map((f) => f.field).filter((f) => !cols.has(f))).toEqual([]);
    expect(order.fields.length).toBe(new Set(order.fields.map((f) => f.field)).size);
  });

  it("the buyer's own columns are erased, and the money and the payment references are kept", () => {
    expect(erased).toEqual(
      expect.arrayContaining([
        "email",
        "shippingName",
        "shippingAddress",
        "shippingZip",
        "shippingCity",
        "billingName",
        "billingAddress",
        "billingZip",
        "billingCity",
        "billingCountry",
        "phoneNumber",
        "cvr",
        "ean",
        "reference",
      ]),
    );
    expect(kept).toEqual(expect.arrayContaining(["totalDkk", "stripePaymentIntentId", "paymentProvider", "paymentRef", "invoiceId"]));
  });

  it("nothing on the kept list is shaped like personal data", () => {
    const personal = /(name|email|phone\w*|address|zip|city|country)$|^billing|^(cvr|ean|reference)$/i;
    expect(kept.filter((c) => personal.test(c))).toEqual([]);
  });
});

describe("the rest of the map", () => {
  it("every field it names exists on its model", () => {
    for (const m of PII_MAP) {
      const cols = new Set(columns(m.model));
      expect(m.fields.map((f) => f.field).filter((f) => !cols.has(f)), m.model).toEqual([]);
    }
  });
});
