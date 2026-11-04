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
    service: { findUnique: vi.fn() },
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
  fetchCurrent,
  parseDirectInput,
  type EditTarget,
} from "@/lib/annotate/targets";
import { isDirectTarget } from "@/lib/annotate/types";
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
  mocks.prisma.service.findUnique.mockReset();
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

  it("accepterer de nye kinds: product.price + service(name|description|price)", () => {
    expect(parseTarget({ kind: "product", slug: "mug", field: "price" })).toEqual({
      kind: "product",
      slug: "mug",
      field: "price",
    });
    for (const field of ["name", "description", "price"] as const) {
      expect(parseTarget({ kind: "service", slug: "teeth-cleaning", field })).toEqual({
        kind: "service",
        slug: "teeth-cleaning",
        field,
      });
    }
    // Ukendte felter afvises stadig.
    expect(parseTarget({ kind: "service", slug: "x", field: "body" })).toBeNull();
    expect(parseTarget({ kind: "product", slug: "x", field: "stock" })).toBeNull();
  });
});

describe("isDirectTarget — pris er data, ikke copy", () => {
  it("kun price-felter er direct", () => {
    expect(isDirectTarget({ kind: "product", slug: "mug", field: "price" })).toBe(true);
    expect(isDirectTarget({ kind: "service", slug: "s", field: "price" })).toBe(true);
    expect(isDirectTarget({ kind: "product", slug: "mug", field: "name" })).toBe(false);
    expect(isDirectTarget({ kind: "service", slug: "s", field: "description" })).toBe(false);
    expect(isDirectTarget({ kind: "setting", field: "tagline" })).toBe(false);
  });
});

describe("targetTool — deterministisk target → tool", () => {
  it("mapper hver kind til det forventede write-tool", () => {
    expect(targetTool({ kind: "genome", key: "footer.tagline" })).toBe("genome.set");
    expect(targetTool({ kind: "setting", field: "tagline" })).toBe("settings.update_copy");
    expect(targetTool({ kind: "page", slug: "x", field: "body" })).toBe("pages.upsert");
    expect(targetTool({ kind: "product", slug: "x", field: "name" })).toBe("products.update");
    expect(targetTool({ kind: "category", slug: "x", field: "name" })).toBe("categories.upsert");
    expect(targetTool({ kind: "product", slug: "x", field: "price" })).toBe("products.update");
    expect(targetTool({ kind: "service", slug: "x", field: "price" })).toBe("services.update");
    expect(targetTool({ kind: "service", slug: "x", field: "name" })).toBe("services.update");
  });
});

describe("parseDirectInput — menneske-input → kanonisk værdi", () => {
  const productPrice: EditTarget = { kind: "product", slug: "mug", field: "price" };
  const servicePrice: EditTarget = { kind: "service", slug: "clean", field: "price" };

  it("product.price: major units (komma ELLER punktum) → øre-heltal som streng", () => {
    expect(parseDirectInput(productPrice, "249")).toEqual({ ok: true, value: "24900" });
    expect(parseDirectInput(productPrice, "249.50")).toEqual({ ok: true, value: "24950" });
    expect(parseDirectInput(productPrice, "249,50")).toEqual({ ok: true, value: "24950" });
    expect(parseDirectInput(productPrice, " 249.5 ")).toEqual({ ok: true, value: "24950" });
  });

  it("product.price: afviser ikke-numerisk, negativt og nul", () => {
    expect(parseDirectInput(productPrice, "abc").ok).toBe(false);
    expect(parseDirectInput(productPrice, "-5").ok).toBe(false);
    expect(parseDirectInput(productPrice, "0").ok).toBe(false);
    expect(parseDirectInput(productPrice, "1.234,56").ok).toBe(false);
    expect(parseDirectInput(productPrice, "").ok).toBe(false);
  });

  it("service.price: freeform passthrough (trimmet), tom afvises", () => {
    expect(parseDirectInput(servicePrice, " from $1,200 ")).toEqual({
      ok: true,
      value: "from $1,200",
    });
    expect(parseDirectInput(servicePrice, "   ").ok).toBe(false);
    expect(parseDirectInput(servicePrice, "x".repeat(101)).ok).toBe(false);
  });

  it("copy-felter er ikke direct-editbare", () => {
    expect(parseDirectInput({ kind: "product", slug: "mug", field: "name" }, "Ny").ok).toBe(false);
    expect(parseDirectInput({ kind: "setting", field: "tagline" }, "Ny").ok).toBe(false);
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

  it("product.price: kanonisk øre-streng → numerisk priceDkk-patch", async () => {
    const args = await buildArgs({ kind: "product", slug: "mug", field: "price" }, "24950");
    expect(args).toEqual({ slug: "mug", patch: { priceDkk: 24950 } });
    expect(args && "confirm" in args).toBe(false);
  });

  it("service: name→title, description→shortDescription, price→priceString", async () => {
    expect(await buildArgs({ kind: "service", slug: "clean", field: "name" }, "Tandrensning")).toEqual(
      { slug: "clean", patch: { title: "Tandrensning" } },
    );
    expect(
      await buildArgs({ kind: "service", slug: "clean", field: "description" }, "En grundig rens"),
    ).toEqual({ slug: "clean", patch: { shortDescription: "En grundig rens" } });
    expect(await buildArgs({ kind: "service", slug: "clean", field: "price" }, "from $129")).toEqual(
      { slug: "clean", patch: { priceString: "from $129" } },
    );
  });
});

describe("fetchCurrent — nye kinds", () => {
  it("product.price returnerer øre som kanonisk streng", async () => {
    mocks.prisma.product.findFirst.mockResolvedValue({
      name: "Mug",
      description: "d",
      priceDkk: 24900,
    });
    expect(await fetchCurrent({ kind: "product", slug: "mug", field: "price" })).toBe("24900");
  });

  it("service mapper felter og falder tilbage til tom streng", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({
      title: "Tandrensning",
      shortDescription: null,
      priceString: "fra 595 kr.",
    });
    expect(await fetchCurrent({ kind: "service", slug: "clean", field: "name" })).toBe(
      "Tandrensning",
    );
    expect(await fetchCurrent({ kind: "service", slug: "clean", field: "description" })).toBe("");
    expect(await fetchCurrent({ kind: "service", slug: "clean", field: "price" })).toBe(
      "fra 595 kr.",
    );
  });

  it("service: ukendt slug → null (endpoint 404)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    expect(await fetchCurrent({ kind: "service", slug: "gone", field: "price" })).toBeNull();
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

  it("product.price: kun positivt øre-heltal passerer (spejler products.update)", () => {
    const t: EditTarget = { kind: "product", slug: "mug", field: "price" };
    expect(validateValue(t, "24950").ok).toBe(true);
    expect(validateValue(t, "abc").ok).toBe(false);
    expect(validateValue(t, "0").ok).toBe(false);
    expect(validateValue(t, "249.50").ok).toBe(false); // ikke-kanonisk (decimal) afvises
  });

  it("service.price: freeform inden for 1..100 tegn", () => {
    const t: EditTarget = { kind: "service", slug: "clean", field: "price" };
    expect(validateValue(t, "from $129").ok).toBe(true);
    expect(validateValue(t, "").ok).toBe(false);
    expect(validateValue(t, "x".repeat(101)).ok).toBe(false);
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

  it("direct-edit (pris): parseDirectInput → buildArgs → token consumes; manipuleret pris afvises", async () => {
    // Hele direct-flowets serverside-kæde, som /api/admin/annotate kører den:
    // rå input → kanonisk værdi → tool-args → token-mint → apply-consume.
    const target: EditTarget = { kind: "service", slug: "teeth-cleaning", field: "price" };
    const parsed = parseDirectInput(target, " from $129 ");
    expect(parsed.ok).toBe(true);
    const canonical = (parsed as { ok: true; value: string }).value;
    expect(validateValue(target, canonical).ok).toBe(true);

    const proposed = await buildArgs(target, canonical);
    expect(proposed).toEqual({ slug: "teeth-cleaning", patch: { priceString: "from $129" } });
    const tool = targetTool(target);
    expect(tool).toBe("services.update");

    const token = createPendingConfirmation({ tool, toolArgs: proposed, ownerId: "admin-1" });
    const ok = consumeConfirmation({
      token,
      tool,
      toolArgs: stripConfirm(proposed),
      ownerId: "admin-1",
    });
    expect(ok.ok).toBe(true);

    // Manipuleret pris mellem direct og apply ⇒ hash mismatch ⇒ afvist.
    const token2 = createPendingConfirmation({ tool, toolArgs: proposed, ownerId: "admin-1" });
    const tampered = { slug: "teeth-cleaning", patch: { priceString: "from $1" } };
    const bad = consumeConfirmation({
      token: token2,
      tool,
      toolArgs: stripConfirm(tampered),
      ownerId: "admin-1",
    });
    expect(bad.ok).toBe(false);
  });

  it("direct-edit (produktpris): øre-konvertering binder token", async () => {
    const target: EditTarget = { kind: "product", slug: "mug", field: "price" };
    const parsed = parseDirectInput(target, "199,95");
    expect(parsed).toEqual({ ok: true, value: "19995" });

    const proposed = await buildArgs(target, "19995");
    expect(proposed).toEqual({ slug: "mug", patch: { priceDkk: 19995 } });

    const tool = targetTool(target);
    expect(tool).toBe("products.update");
    const token = createPendingConfirmation({ tool, toolArgs: proposed, ownerId: "admin-1" });
    const ok = consumeConfirmation({
      token,
      tool,
      toolArgs: stripConfirm(proposed),
      ownerId: "admin-1",
    });
    expect(ok.ok).toBe(true);
  });
});
