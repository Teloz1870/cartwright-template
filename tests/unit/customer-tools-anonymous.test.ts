import { describe, expect, it } from "vitest";

import { CUSTOMER_TOOL_ALLOWLIST } from "@/lib/ai/client";
import { getTool } from "@/lib/tools/registry";
import { buildVoiceShopTools } from "@/lib/voice/tools";

/**
 * The storefront chat and voice shop take anonymous callers: a made-up cookie is
 * all they need. A tool that answered for any email or phone number therefore gave
 * anyone a customer's name and home address.
 */
describe("what an anonymous shopper's chat can read about customers", () => {
  it("only their own saved address, keyed on their own session", () => {
    const customerData = CUSTOMER_TOOL_ALLOWLIST.filter(
      (name) => getTool(name)?.scope === "customer:read",
    );
    expect(customerData).toEqual(["user.get_last_shipping"]);
  });

  it("a voice shop whose settings still list the lookups does not offer them", () => {
    const bundle = buildVoiceShopTools([
      "customer.lookup_by_email",
      "customer.lookup_by_phone",
      "cart.get_summary",
    ]);
    expect(Object.values(bundle.nameMap)).toEqual(["cart.get_summary"]);
  });

  it("the lookups stay on the registry for an admin key with customer:read", () => {
    expect(getTool("customer.lookup_by_email")?.scope).toBe("customer:read");
    expect(getTool("customer.lookup_by_phone")?.scope).toBe("customer:read");
  });
});
