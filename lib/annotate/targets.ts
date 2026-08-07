import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { GENOME_FIELDS, isGenomeFieldKey } from "@/lib/genome/fields";
import { readField } from "@/lib/genome/read";
import type { EditTarget, SettingField } from "@/lib/annotate/types";

export type { EditTarget, SettingField };

/**
 * Annotate target-register — den ENESTE allowlist for hvad in-place-editing må
 * røre, OG den deterministiske mapping target → write-tool. AI'en vælger aldrig
 * tool selv: /api/admin/annotate udleder det herfra. Samme filosofi som
 * GENOME_FIELDS (lib/genome/fields.ts) og ADMIN_TOOL_ALLOWLIST (lib/ai/client.ts).
 *
 * Typerne (EditTarget/SettingField) lever i lib/annotate/types.ts så de er
 * klient-importérbare; denne fil tilføjer den server-only logik (prisma + LLM-
 * read). Et `data-cw-edit`-attribut serialiserer en EditTarget — KUN en pointer:
 * serveren genudleder tool + genhenter nuværende værdi ud fra key/slug/field, så
 * et manipuleret attribut højst kan pege på et andet editbart felt admin allerede
 * har skrive-scope til (ingen privilege-eskalering).
 */

const slugRule = z.string().min(1).max(200);

const rawTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("genome"), key: z.string() }),
  z.object({ kind: z.literal("setting"), field: z.enum(["websiteHeadline", "tagline"]) }),
  z.object({ kind: z.literal("page"), slug: slugRule, field: z.enum(["title", "body"]) }),
  z.object({
    kind: z.literal("product"),
    slug: slugRule,
    field: z.enum(["name", "description", "price"]),
  }),
  z.object({ kind: z.literal("category"), slug: slugRule, field: z.enum(["name", "description"]) }),
  z.object({
    kind: z.literal("service"),
    slug: slugRule,
    field: z.enum(["name", "description", "price"]),
  }),
]);

/**
 * Validér + normalisér et ukendt JSON-objekt til en EditTarget. Returnerer null
 * hvis formen er ugyldig, eller (for genome) hvis key ikke er registreret eller
 * er `anchored` (juridisk/identitets-tekst som ALDRIG må AI-omskrives).
 */
export function parseTarget(raw: unknown): EditTarget | null {
  const p = rawTargetSchema.safeParse(raw);
  if (!p.success) return null;
  const t = p.data;
  if (t.kind === "genome") {
    if (!isGenomeFieldKey(t.key)) return null;
    if (GENOME_FIELDS[t.key].lock === "anchored") return null;
    return { kind: "genome", key: t.key };
  }
  return t;
}

/** Deterministisk target → write-tool. AI'en vælger aldrig dette selv. */
export function targetTool(target: EditTarget): string {
  switch (target.kind) {
    case "genome":
      return "genome.set";
    case "setting":
      return "settings.update_copy";
    case "page":
      return "pages.upsert";
    case "product":
      return "products.update";
    case "category":
      return "categories.upsert";
    case "service":
      return "services.update";
  }
}

/** Menneske-læseligt label til prompt-kontekst + diff-overskrift. */
export function targetLabel(target: EditTarget): string {
  switch (target.kind) {
    case "genome":
      return GENOME_FIELDS[target.key].label;
    case "setting":
      return target.field === "websiteHeadline" ? "hero heading" : "hero sub-line";
    case "page":
      return target.field === "title" ? "page title" : "page body";
    case "product":
      if (target.field === "price") return "product price";
      return target.field === "name" ? "product name" : "product description";
    case "category":
      return target.field === "name" ? "category name" : "category description";
    case "service":
      if (target.field === "price") return "service price";
      return target.field === "name" ? "service name" : "service description";
  }
}

/**
 * Længde-grænser — spejler write-tool'ets eget Zod-schema, så en værdi der
 * passerer her også passerer ved apply (undgår 422 sent i flowet). For genome
 * udledes grænserne fra feltets registrerede schema; bounds er kun et prompt-
 * hint — den hårde validering sker i validateValue mod selve schemaet.
 */
export function bounds(target: EditTarget): { min: number; max: number } {
  switch (target.kind) {
    case "genome": {
      const s = GENOME_FIELDS[target.key].schema as unknown as {
        minLength?: number | null;
        maxLength?: number | null;
      };
      return { min: s.minLength ?? 1, max: s.maxLength ?? 300 };
    }
    case "setting":
      return { min: 1, max: 200 };
    case "page":
      return target.field === "title" ? { min: 2, max: 200 } : { min: 10, max: 8000 };
    case "product":
      // price-bounds er på den KANONISKE streng (øre-heltal som tekst, fx
      // "24950") — den hårde validering sker i validateValue/parseDirectInput.
      if (target.field === "price") return { min: 1, max: 12 };
      return target.field === "name" ? { min: 2, max: 200 } : { min: 10, max: 4000 };
    case "category":
      return target.field === "name" ? { min: 2, max: 120 } : { min: 1, max: 2000 };
    case "service":
      // Spejler services.update-schemaet: title 2..200, shortDescription 1..500,
      // priceString 1..100 (freeform admin-copy som "from $1,200" / "On request").
      if (target.field === "price") return { min: 1, max: 100 };
      return target.field === "name" ? { min: 2, max: 200 } : { min: 1, max: 500 };
  }
}

/**
 * Normalisér rå menneske-input for et DIREKTE (struktureret) felt til den
 * kanoniske streng som validateValue/buildArgs arbejder på. Bruges KUN af
 * "direct"-fasen i /api/admin/annotate — copy-felter går aldrig herigennem.
 *
 *   product.price  "249", "249.50", "249,50"  →  øre-heltal som streng ("24950")
 *   service.price  freeform passthrough (trimmet) — priceString er admin-copy
 *
 * Returnerer { ok:false } med en menneske-læselig fejl ved ugyldigt input.
 */
export function parseDirectInput(
  target: EditTarget,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (target.kind === "product" && target.field === "price") {
    // Major units med valgfri 1-2 decimaler; komma OG punktum accepteres.
    const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(trimmed);
    if (!m) {
      return { ok: false, error: "Enter a price like 249 or 249.50" };
    }
    const major = Number(m[1]);
    const minor = Number((m[2] ?? "").padEnd(2, "0") || "0");
    const oere = major * 100 + minor;
    if (oere <= 0) return { ok: false, error: "Price must be greater than 0" };
    return { ok: true, value: String(oere) };
  }
  if (target.kind === "service" && target.field === "price") {
    if (trimmed.length < 1) return { ok: false, error: "Price text can't be empty" };
    if (trimmed.length > 100) return { ok: false, error: "Too long (max 100 characters)" };
    return { ok: true, value: trimmed };
  }
  return { ok: false, error: "This field is not directly editable" };
}

/** Server-side validering af AI-forslaget FØR et confirmation-token mintes. */
export function validateValue(
  target: EditTarget,
  value: string,
): { ok: true } | { ok: false; error: string } {
  if (target.kind === "genome") {
    const r = GENOME_FIELDS[target.key].schema.safeParse(value);
    return r.success
      ? { ok: true }
      : { ok: false, error: r.error.issues[0]?.message ?? "Invalid value" };
  }
  if (target.kind === "product" && target.field === "price") {
    // Kanonisk form: øre som positivt heltal (spejler products.update's
    // z.number().int().positive() så apply aldrig 422'er).
    if (!/^\d{1,12}$/.test(value) || Number(value) <= 0) {
      return { ok: false, error: "Price must be a positive amount in minor units" };
    }
    return { ok: true };
  }
  const b = bounds(target);
  const len = value.trim().length;
  if (len < b.min) return { ok: false, error: `Too short (min ${b.min} characters)` };
  if (len > b.max) return { ok: false, error: `Too long (max ${b.max} characters)` };
  return { ok: true };
}

/**
 * Nuværende værdi af det redigerede felt — til diff + prompt-kontekst.
 * Returnerer null hvis target ikke findes (→ endpoint 404). For genome bruges
 * readField (samme præcedens som render: override ?? cache ?? anker). For hero-
 * copy falder vi tilbage til brand.config-ankeret når DB-kolonnen er null, så
 * "før"-værdien matcher det der faktisk vises.
 */
export async function fetchCurrent(target: EditTarget): Promise<string | null> {
  switch (target.kind) {
    case "genome":
      return readField(target.key);
    case "setting": {
      const b = await prisma.brandingSettings.findUnique({
        where: { id: 1 },
        select: { websiteHeadline: true, tagline: true },
      });
      if (target.field === "websiteHeadline") {
        return b?.websiteHeadline ?? brand.website?.headline ?? "";
      }
      return b?.tagline ?? brand.website?.tagline ?? "";
    }
    case "page": {
      const p = await prisma.page.findUnique({
        where: { slug: target.slug },
        select: { title: true, body: true },
      });
      if (!p) return null;
      return target.field === "title" ? p.title : p.body;
    }
    case "product": {
      const p = await prisma.product.findFirst({
        where: { slug: target.slug, deletedAt: null },
        select: { name: true, description: true, priceDkk: true },
      });
      if (!p) return null;
      // price: kanonisk øre-heltal som streng — overlayet formaterer til
      // major units i input-feltet; render-swap springes over (isShortField).
      if (target.field === "price") return String(p.priceDkk);
      return target.field === "name" ? p.name : p.description;
    }
    case "category": {
      const c = await prisma.category.findUnique({
        where: { slug: target.slug },
        select: { name: true, description: true },
      });
      if (!c) return null;
      return target.field === "name" ? c.name : c.description ?? "";
    }
    case "service": {
      const s = await prisma.service.findUnique({
        where: { slug: target.slug },
        select: { title: true, shortDescription: true, priceString: true },
      });
      if (!s) return null;
      if (target.field === "price") return s.priceString ?? "";
      return target.field === "name" ? s.title : s.shortDescription ?? "";
    }
  }
}

/**
 * Byg de PRÆCISE tool-args (UDEN `confirm`) som apply-fasen sender til
 * invokeTool. `confirm` tilføjes først server-side efter consumeConfirmation, så
 * args-hash'en er stabil fra propose → apply. For tools der kræver alle felter
 * (pages.upsert, categories.upsert) read-modify-write'er vi søskende-felterne
 * her, så et enkelt-felt-edit aldrig blanker en kolonne. Returnerer null hvis
 * target ikke længere findes (samtidig sletning mellem propose og apply).
 */
export async function buildArgs(
  target: EditTarget,
  newValue: string,
): Promise<Record<string, unknown> | null> {
  switch (target.kind) {
    case "genome":
      return { key: target.key, value: newValue };
    case "setting":
      return { field: target.field, value: newValue };
    case "page": {
      const p = await prisma.page.findUnique({
        where: { slug: target.slug },
        select: { title: true, body: true },
      });
      if (!p) return null;
      return target.field === "title"
        ? { slug: target.slug, title: newValue, body: p.body }
        : { slug: target.slug, title: p.title, body: newValue };
    }
    case "product":
      // price: kanonisk øre-streng → tal (products.update tager priceDkk: int).
      if (target.field === "price") {
        return { slug: target.slug, patch: { priceDkk: Number(newValue) } };
      }
      return { slug: target.slug, patch: { [target.field]: newValue } };
    case "service": {
      // Felt-mapping: name→title, description→shortDescription, price→priceString.
      const field =
        target.field === "name"
          ? "title"
          : target.field === "price"
            ? "priceString"
            : "shortDescription";
      return { slug: target.slug, patch: { [field]: newValue } };
    }
    case "category": {
      const c = await prisma.category.findUnique({
        where: { slug: target.slug },
        select: { name: true, description: true },
      });
      if (!c) return null;
      if (target.field === "name") {
        return c.description != null
          ? { slug: target.slug, name: newValue, description: c.description }
          : { slug: target.slug, name: newValue };
      }
      return { slug: target.slug, name: c.name, description: newValue };
    }
  }
}
