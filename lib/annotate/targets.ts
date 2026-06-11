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
  z.object({ kind: z.literal("product"), slug: slugRule, field: z.enum(["name", "description"]) }),
  z.object({ kind: z.literal("category"), slug: slugRule, field: z.enum(["name", "description"]) }),
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
      return target.field === "name" ? "product name" : "product description";
    case "category":
      return target.field === "name" ? "category name" : "category description";
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
      return target.field === "name" ? { min: 2, max: 200 } : { min: 10, max: 4000 };
    case "category":
      return target.field === "name" ? { min: 2, max: 120 } : { min: 1, max: 2000 };
  }
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
        select: { name: true, description: true },
      });
      if (!p) return null;
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
      return { slug: target.slug, patch: { [target.field]: newValue } };
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
