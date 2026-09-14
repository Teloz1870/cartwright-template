import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaUserFindUnique: vi.fn(),
  decodeShippingCookie: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.prismaUserFindUnique } },
}));

vi.mock("@/lib/shipping-cookie", () => ({
  decodeShippingCookie: mocks.decodeShippingCookie,
  SHIPPING_COOKIE_NAME: "last_shipping",
}));

import { getLastShippingTool } from "@/lib/tools/customer";

type Ctx = Parameters<typeof getLastShippingTool.handler>[1];

const STORED_SHIPPING = {
  name: "Kenni Madsen",
  address: "Vesterbrogade 12",
  zip: "1620",
  city: "København V",
};

describe("user.get_last_shipping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returnerer source=session når kunde er logget ind og har gemt adresse", async () => {
    (mocks.prismaUserFindUnique as Mock).mockResolvedValue({
      shippingName: STORED_SHIPPING.name,
      shippingAddress: STORED_SHIPPING.address,
      shippingZip: STORED_SHIPPING.zip,
      shippingCity: STORED_SHIPPING.city,
    });

    const result = await getLastShippingTool.handler({}, {
      actor: "storefront-chat:sid-A",
      userId: "user-1",
    } as Ctx);

    expect(result).toEqual({
      source: "session",
      shipping: STORED_SHIPPING,
    });
    expect(mocks.decodeShippingCookie).not.toHaveBeenCalled();
  });

  it("falls through til cookie hvis userId sat men User mangler shipping-data", async () => {
    (mocks.prismaUserFindUnique as Mock).mockResolvedValue({
      shippingName: null,
      shippingAddress: null,
      shippingZip: null,
      shippingCity: null,
    });
    (mocks.decodeShippingCookie as Mock).mockReturnValue({
      ...STORED_SHIPPING,
      storedAt: 1_700_000_000_000,
    });

    const cookies = new Map([["last_shipping", "encoded-blob"]]);
    const result = await getLastShippingTool.handler({}, {
      actor: "storefront-chat:sid-A",
      userId: "user-1",
      cookies,
    } as Ctx);

    expect(result).toEqual({
      source: "cookie",
      shipping: STORED_SHIPPING,
      storedAt: 1_700_000_000_000,
    });
  });

  it("returnerer source=cookie når ikke logget ind men cookie sat", async () => {
    (mocks.decodeShippingCookie as Mock).mockReturnValue({
      ...STORED_SHIPPING,
      storedAt: 1_700_000_000_000,
    });

    const cookies = new Map([["last_shipping", "encoded-blob"]]);
    const result = await getLastShippingTool.handler({}, {
      actor: "storefront-chat:sid-A",
      userId: null,
      cookies,
    } as Ctx);

    expect(result).toMatchObject({
      source: "cookie",
      shipping: STORED_SHIPPING,
    });
    expect(mocks.prismaUserFindUnique).not.toHaveBeenCalled();
  });

  it("returnerer source=none når intet er gemt", async () => {
    (mocks.decodeShippingCookie as Mock).mockReturnValue(null);

    const result = await getLastShippingTool.handler({}, {
      actor: "storefront-chat:sid-A",
      userId: null,
      cookies: new Map(),
    } as Ctx);

    expect(result).toEqual({ source: "none" });
  });
});
