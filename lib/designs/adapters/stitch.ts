/**
 * Gemini Stitch → cartwright-design-v1 adapter.
 *
 * Stitch eksporterer designs som YAML-frontmatter md med deres egen schema.
 * Vi normaliserer til vores spec så parser.ts kan håndtere det downstream.
 *
 * Stitch's format (per september 2025 dokumentation):
 *
 *   ---
 *   stitch_version: 1
 *   brand:
 *     name: "Acme Studio"
 *     description: "..."
 *     target: web                    # web | mobile | both
 *   colors:
 *     primary: "#0066cc"
 *     primary_dark: "#004499"
 *     background: "#fff"
 *     surface: "#f5f5f5"
 *     text: "#111"
 *     text_muted: "#666"
 *   typography:
 *     body: "Inter, sans-serif"
 *     code: "JetBrains Mono, monospace"
 *   sections:
 *     - kind: hero
 *       title: "..."
 *       subtitle: "..."
 *       cta_text: "..."
 *       cta_url: "..."
 *     - kind: features
 *       title: "..."
 *       items:
 *         - { name: "...", body: "..." }
 *   ---
 *
 * Mapper til cartwright-design-v1 (palette dækker fra colors → 6 core,
 * sections.kind → type alias-mapping, typography → fonts).
 */
import yaml from "js-yaml";
import { serializeDesignMd } from "../serializer";
import type { DesignMdSpec, DesignSection } from "../spec";

type StitchRaw = {
  stitch_version?: number;
  brand?: {
    name?: string;
    description?: string;
    target?: "web" | "mobile" | "both";
    slug?: string;
    premium?: boolean;
  };
  colors?: Partial<
    Record<
      "primary" | "primary_dark" | "background" | "surface" | "text" | "text_muted",
      string
    >
  >;
  typography?: { body?: string; code?: string };
  sections?: Array<Record<string, unknown> & { kind?: string }>;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Konverterer en Stitch-eksporteret design.md til cartwright-design-v1
 * format. Output er en string der kan piped direkte ind i parser.ts.
 *
 * Vi normaliserer aggressivt: missing fields får sensible defaults (sort
 * accent, hvid baggrund, "Imported design" som navn). Bedre at producere
 * en valid design der ser kedelig ud end at fejle helt — designeren kan
 * altid finjustere i `npx cartwright design export <slug>` round-trip.
 */
export function fromStitchMd(raw: string, opts: { slug?: string } = {}): string {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(
      "Stitch design fil mangler YAML frontmatter (--- delimitere).",
    );
  }
  const [, frontmatter, body] = match;

  const loaded = yaml.load(frontmatter) as StitchRaw | null;
  if (!loaded || typeof loaded !== "object") {
    throw new Error("Stitch frontmatter parse-fejl.");
  }

  const slug =
    opts.slug ?? loaded.brand?.slug ?? slugify(loaded.brand?.name ?? "imported");

  const primary = loaded.colors?.primary ?? "#0a0a0a";
  const primaryDark =
    loaded.colors?.primary_dark ?? darken(primary, 0.15) ?? primary;

  const spec: DesignMdSpec = {
    schema: "cartwright-design-v1",
    slug,
    name: loaded.brand?.name ?? "Imported design",
    description:
      loaded.brand?.description ??
      "Imported from Gemini Stitch — adjust copy + tokens in design.md and re-import to refine.",
    mode: stitchTargetToMode(loaded.brand?.target),
    premium: loaded.brand?.premium ?? false,
    tokens: {
      // Custom prefix per imported design så multi-import ikke kollidere
      prefix: slug.replace(/-/g, "").slice(0, 8) || "imp",
      palette: {
        accent: primary,
        accentDeep: primaryDark,
        cream: loaded.colors?.background ?? "#ffffff",
        sand: loaded.colors?.surface ?? "#f5f5f5",
        ink: loaded.colors?.text ?? "#111111",
        muted: loaded.colors?.text_muted ?? "#666666",
      },
      fonts: {
        sans: loaded.typography?.body,
        mono: loaded.typography?.code,
      },
    },
    sections: (loaded.sections ?? []).map(stitchSectionToOurs).filter(Boolean) as DesignSection[],
  };

  // Hvis sections er tom efter mapping: fald tilbage til sensible hero-only
  // så valideringen ikke fejler. Designeren kan så tilføje flere via
  // round-trip edit.
  if (spec.sections.length === 0) {
    spec.sections = [
      {
        type: "hero",
        headline: spec.name,
        tagline: spec.description,
        cta: { label: "Get started", href: "/contact" },
      },
    ];
  }

  return serializeDesignMd(spec, body?.trim() ?? "");
}

// ── Section type mapping ───────────────────────────────────────────────────

function stitchSectionToOurs(s: Record<string, unknown>): DesignSection | null {
  const kind = String((s.kind ?? s.type ?? "")).toLowerCase();

  switch (kind) {
    case "hero":
      return {
        type: "hero",
        headline: String(s.title ?? s.headline ?? "Untitled hero"),
        tagline: String(s.subtitle ?? s.tagline ?? s.description ?? ""),
        cta: {
          label: String(s.cta_text ?? s.cta_label ?? "Get started"),
          href: String(s.cta_url ?? s.cta_href ?? "/contact"),
        },
        eyebrow: s.eyebrow ? String(s.eyebrow) : undefined,
      };
    case "features":
    case "feature-grid":
      return {
        type: "feature-grid",
        title: String(s.title ?? "Features"),
        description: s.description ? String(s.description) : undefined,
        items: ((s.items as any[]) ?? []).map((i) => ({
          title: String(i.name ?? i.title ?? "Feature"),
          body: String(i.body ?? i.description ?? ""),
        })).slice(0, 30),
      };
    case "values":
    case "value-props":
      return {
        type: "value-props",
        title: String(s.title ?? "Why us"),
        description: s.description ? String(s.description) : undefined,
        items: ((s.items as any[]) ?? []).slice(0, 6).map((i) => ({
          title: String(i.name ?? i.title ?? "Value"),
          body: String(i.body ?? i.description ?? ""),
        })),
      };
    case "steps":
    case "how-it-works":
    case "process":
      return {
        type: "how-it-works",
        title: String(s.title ?? "How it works"),
        items: ((s.items as any[]) ?? []).slice(0, 6).map((i, idx) => ({
          n: String(i.n ?? String(idx + 1).padStart(2, "0")),
          title: String(i.title ?? i.name ?? `Step ${idx + 1}`),
          body: String(i.body ?? i.description ?? ""),
          code: i.code ? String(i.code) : undefined,
        })),
      };
    case "stack":
    case "stack-grid":
    case "tech":
      return {
        type: "stack-grid",
        title: String(s.title ?? "The stack"),
        items: ((s.items as any[]) ?? []).map(String).slice(0, 60),
      };
    case "cta":
    case "cta-footer":
    case "final-cta":
      return {
        type: "cta-footer",
        title: String(s.title ?? "Get started today"),
        cta: {
          label: String(s.cta_text ?? "Get started"),
          href: String(s.cta_url ?? "/contact"),
        },
      };
    default:
      // Ukendt kind — skip pænt frem for at crashe. Designeren får dem
      // op i `npx cartwright design import --verbose` output.
      return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stitchTargetToMode(t?: string): "website" | "webshop" | "both" {
  if (t === "mobile") return "both"; // mobile sites kan være begge dele
  return "website"; // default Stitch er typisk marketing sites
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "imported";
}

function darken(hex: string, amount: number): string | null {
  // Simpel hex-darken: hver komponent multiplied med (1-amount).
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
