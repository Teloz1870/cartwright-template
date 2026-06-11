import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * In-place AI editing — target-register + prompt-renser + token-rundtur.
 * Bekræfter den deterministiske target → tool-mapping, at anchored genome-felter
 * udelukkes, at read-modify-write inkluderer søskende-felter (pages.upsert), at
 * proposedArgs ALDRIG indeholder `confirm`, og at args-hash'en binder propose →
 * apply (én ændret char ⇒ token afvist).
 *
 * Mocker @/lib/db (prisma) + @/lib/genome/read (readField), men bruger de RIGTIGE
 * @/lib/genome/fields, så anchored-udelukkelsen testes mod den faktiske allowlist.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    brandingSettings: { findUnique: vi.fn() },
    page: { findUnique: vi.fn() },
    product: { findFirst: vi.fn() },
    category: { findUnique: vi.fn() },
  },
  readField: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/genome/read", () => ({ readField: mocks.readField }));

import {
  parseTarget,
  targetTool,
  buildArgs,
  validateValue,
  type EditTarget,
} from "@/lib/annotate/targets";
import { stripQuotesAndTrim } from "@/lib/annotate/prompt";
import {
  createPendingConfirmation,
  consumeConfirmation,
  stripConfirm,
  _resetPendingConfirmations,
} from "@/lib/confirmation-tokens";

beforeEach(() => {
  _resetPendingConfirmations();
  mocks.readField.mockReset().mockResolvedValue("current footer tagline value");
  mocks.prisma.page.findUnique.mockReset();
  mocks.prisma.product.findFirst.mockReset();
  mocks.prisma.category.findUnique.mockReset();
  mocks.prisma.brandingSettings.findUnique.mockReset();
});

describe("parseTarget — allowlist + anchored-udelukkelse", () => {
  it("accepterer et registreret, resolvable genome-felt", () => {
    expect(parseTarget({ kind: "genome", key: "footer.tagline" })).toEqual({
      kind: "genome",
      key: "footer.tagline",
    });
  });

  it("afviser et anchored genome-felt (juridisk tekst må aldrig AI-omskrives)", () => {
    expect(parseTarget({ kind: "genome", key: "footer.disclaimer" })).toBeNull();
  });

  it("afviser en ukendt genome-key", () => {
    expect(parseTarget({ kind: "genome", key: "footer.nonexistent" })).toBeNull();
  });

  it("afviser ugyldig form / ukendt kind", () => {
    expect(parseTarget({ kind: "bogus", x: 1 })).toBeNull();
    expect(parseTarget({ kind: "page", field: "title" })).toBeNull(); // mangler slug
    expect(parseTarget(null)).toBeNull();
  });

  it("accepterer setting/page/product/category", () => {
    expect(parseTarget({ kind: "setting", field: "websiteHeadline" })).toEqual({
      kind: "setting",
      field: "websiteHeadline",
    });
    expect(parseTarget({ kind: "page", slug: "about", field: "body" })).toEqual({
      kind: "page",
      slug: "about",
      field: "body",
    });
  });
});

describe("targetTool — deterministisk target → tool", () => {
  it("mapper hver kind til det forventede write-tool", () => {
    expect(targetTool({ kind: "genome", key: "footer.tagline" })).toBe("genome.set");
    expect(targetTool({ kind: "setting", field: "tagline" })).toBe("settings.update_copy");
    expect(targetTool({ kind: "page", slug: "x", field: "body" })).toBe("pages.upsert");
    expect(targetTool({ kind: "product", slug: "x", field: "name" })).toBe("products.update");
    expect(targetTool({ kind: "category", slug: "x", field: "name" })).toBe("categories.upsert");
  });
});

describe("buildArgs — read-modify-write + ingen confirm", () => {
  it("pages.upsert(body) inkluderer den nuværende title (blanker ikke søskende)", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ title: "Om os", body: "gammel" });
    const args = await buildArgs({ kind: "page", slug: "about", field: "body" }, "ny brødtekst her");
    expect(args).toEqual({ slug: "about", title: "Om os", body: "ny brødtekst her" });
    expect(args && "confirm" in args).toBe(false);
  });

  it("pages.upsert(title) inkluderer den nuværende body", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ title: "gammel", body: "uændret brødtekst" });
    const args = await buildArgs({ kind: "page", slug: "about", field: "title" }, "Ny Titel");
    expect(args).toEqual({ slug: "about", title: "Ny Titel", body: "uændret brødtekst" });
  });

  it("products.update bygger en partial patch", async () => {
    const args = await buildArgs({ kind: "product", slug: "mug", field: "description" }, "en længere beskrivelse");
    expect(args).toEqual({ slug: "mug", patch: { description: "en længere beskrivelse" } });
  });

  it("categories.upsert(name) udelader description når den er null", async () => {
    mocks.prisma.category.findUnique.mockResolvedValue({ name: "gammel", description: null });
    const args = await buildArgs({ kind: "category", slug: "coffee", field: "name" }, "Kaffe");
    expect(args).toEqual({ slug: "coffee", name: "Kaffe" });
  });

  it("genome/setting proposedArgs indeholder aldrig confirm", async () => {
    const g = await buildArgs({ kind: "genome", key: "footer.tagline" }, "en ny tagline her");
    const s = await buildArgs({ kind: "setting", field: "websiteHeadline" }, "Ny overskrift");
    expect(g).toEqual({ key: "footer.tagline", value: "en ny tagline her" });
    expect(s).toEqual({ field: "websiteHeadline", value: "Ny overskrift" });
    expect(g && "confirm" in g).toBe(false);
    expect(s && "confirm" in s).toBe(false);
  });

  it("returnerer null hvis target er forsvundet (samtidig sletning)", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    expect(await buildArgs({ kind: "page", slug: "gone", field: "body" }, "x".repeat(20))).toBeNull();
  });
});

describe("validateValue — spejler tool-schema", () => {
  it("afviser for kort genome-værdi og accepterer en gyldig", () => {
    const t: EditTarget = { kind: "genome", key: "footer.tagline" }; // min 10, max 220
    expect(validateValue(t, "kort").ok).toBe(false);
    expect(validateValue(t, "en helt fin tagline").ok).toBe(true);
  });

  it("håndhæver længde for kolonne-felter (page body min 10)", () => {
    const t: EditTarget = { kind: "page", slug: "about", field: "body" };
    expect(validateValue(t, "kort").ok).toBe(false);
    expect(validateValue(t, "dette er en tilstrækkelig lang brødtekst").ok).toBe(true);
  });
});

describe("stripQuotesAndTrim — renser model-output", () => {
  it("fjerner omsluttende citationstegn og code fences", () => {
    expect(stripQuotesAndTrim('  "Hej verden"  ')).toBe("Hej verden");
    expect(stripQuotesAndTrim("```\nHej\n```")).toBe("Hej");
    expect(stripQuotesAndTrim("“Smukt”")).toBe("Smukt");
    expect(stripQuotesAndTrim("uændret")).toBe("uændret");
  });
});

describe("token-rundtur — propose-args binder apply", () => {
  it("samme args ⇒ token consumes; én ændret char ⇒ afvist", async () => {
    const target: EditTarget = { kind: "genome", key: "footer.tagline" };
    const proposed = await buildArgs(target, "kaffe værd at sætte farten ned for");
    const tool = targetTool(target);

    const token = createPendingConfirmation({
      tool,
      toolArgs: proposed,
      ownerId: "admin-1",
    });

    // Apply med uændrede args (efter stripConfirm, som endpointet gør) → ok.
    const ok = consumeConfirmation({
      token,
      tool,
      toolArgs: stripConfirm(proposed),
      ownerId: "admin-1",
    });
    expect(ok.ok).toBe(true);

    // Nyt token, men klienten manipulerer copy før apply → hash mismatch.
    const token2 = createPendingConfirmation({ tool, toolArgs: proposed, ownerId: "admin-1" });
    const tampered = { ...(proposed as Record<string, unknown>), value: "noget helt andet her" };
    const bad = consumeConfirmation({ token: token2, tool, toolArgs: stripConfirm(tampered), ownerId: "admin-1" });
    expect(bad.ok).toBe(false);
  });
});
