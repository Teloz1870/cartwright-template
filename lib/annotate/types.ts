import type { GenomeFieldKey } from "@/lib/genome/fields";

/**
 * Client-safe target-typer for in-place editing. Holdt adskilt fra
 * lib/annotate/targets.ts (som er `server-only`: prisma + readField), så
 * server-komponenter OG klient-overlay'et kan importere typen + editAttr-helper
 * uden at trække server-runtime ind i klient-bundlen. lib/genome/fields.ts er
 * IKKE server-only, så GenomeFieldKey-type-importen er sikker begge steder.
 */

export type SettingField = "websiteHeadline" | "tagline";

export type EditTarget =
  | { kind: "genome"; key: GenomeFieldKey }
  | { kind: "setting"; field: SettingField }
  | { kind: "page"; slug: string; field: "title" | "body" }
  | { kind: "product"; slug: string; field: "name" | "description" }
  | { kind: "category"; slug: string; field: "name" | "description" };
