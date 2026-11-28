import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { zodInputJsonSchema, zodOutputJsonSchema } from "@/lib/zod-json-schema";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ withAudit: vi.fn() }));

/**
 * DRØM133-b — the ceilings on usageLimit/validUntil and the toggle's new
 * refusal live in the handlers only, read while `apiDiscountBounds` is on. What
 * `tools/list` (and /api/mcp's discovery) publishes for the three bounded tools
 * — name, description, input and output JSON Schema — is pinned here to the
 * hash it had on origin/main before the change (70611d13), so a shop with the
 * flag off sees a byte-identical tool surface.
 *
 * A deliberate change to one of these tools updates the hash in the same PR.
 */
const PINNED = "0c1fac206ab2d27439cfdb1385343ddd78308d294324eccb51ccd51e125274ff";

describe("the bounded discount tools' published surface", () => {
  it("is unchanged from origin/main", async () => {
    const { createDiscount, toggleDiscount } = await import("@/lib/tools/discounts");
    const { createCampaign } = await import("@/lib/tools/marketing");
    const surface = [createDiscount, toggleDiscount, createCampaign].map((t) => ({
      name: t.name,
      description: t.description,
      scope: t.scope,
      input: zodInputJsonSchema(t.input),
      output: zodOutputJsonSchema(t.output),
    }));
    const hash = createHash("sha256").update(JSON.stringify(surface)).digest("hex");
    expect(hash).toBe(PINNED);
  });
});
