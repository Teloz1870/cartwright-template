import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pageFindMany: vi.fn(),
  brand: {
    storeSlug: "fork-shop",
    company: {
      legalName: "Fork Shop ApS",
      address: "Testvej 1",
      postalCode: "1000",
      city: "København",
      sameAs: ["https://github.com/Teloz1870/cartwright-template"],
    },
    contact: { email: "support@fork.example" },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/brand.config", () => ({ brand: mocks.brand }));
vi.mock("@/lib/db", () => ({
  prisma: { page: { findMany: mocks.pageFindMany } },
}));

describe("trust content fork audit", () => {
  beforeEach(() => {
    mocks.pageFindMany.mockResolvedValue([
      { slug: "about", body: "A".repeat(500) },
      { slug: "contact", body: "C".repeat(500) },
      { slug: "privacy", body: "P".repeat(500) },
    ]);
    mocks.brand.storeSlug = "fork-shop";
    mocks.brand.company.sameAs = ["https://github.com/Teloz1870/cartwright-template"];
  });

  it("warns a generated fork when Cartwright authority profiles remain", async () => {
    const { auditTrustContent } = await import("@/lib/trust-content-audit");
    await expect(auditTrustContent()).resolves.toContainEqual({
      page: "company",
      message: "Replace Cartwright's default company.sameAs profiles with this fork's official authority profiles.",
    });
  });

  it("accepts fork-owned authority profiles", async () => {
    mocks.brand.company.sameAs = ["https://www.linkedin.com/company/fork-shop"];
    const { auditTrustContent } = await import("@/lib/trust-content-audit");
    const findings = await auditTrustContent();
    expect(findings).not.toContainEqual(expect.objectContaining({ page: "company" }));
  });

  it("warns when a substantive trust page still contains demo identity", async () => {
    mocks.brand.company.sameAs = ["https://www.linkedin.com/company/fork-shop"];
    mocks.pageFindMany.mockResolvedValue([
      { slug: "about", body: "A".repeat(500) },
      { slug: "contact", body: "C".repeat(500) },
      {
        slug: "privacy",
        body: `${"P".repeat(520)} Contact admin@northbound.demo.`,
      },
    ]);

    const { auditTrustContent } = await import("@/lib/trust-content-audit");
    await expect(auditTrustContent()).resolves.toContainEqual({
      page: "privacy",
      message: "/privacy still contains placeholder language.",
    });
  });
});
