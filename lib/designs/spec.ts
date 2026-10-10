/**
 * cartwright-design-v1 — canonical design.md spec.
 *
 * Designs lever som design.md filer der kan importes via
 * `npx cartwright design import <file>` eller drag-drop i /admin/designs.
 * Format: YAML frontmatter + Markdown body. YAML beskriver palette, fonts,
 * og section-komposition; Markdown body er fri-form designer-notes
 * (renderes ikke).
 *
 * Schema-version er en simpel string i frontmatter:
 *   schema: cartwright-design-v1
 *
 * Vi validerer alle imports mod denne Zod-schema → tydelige error-messages
 * når en tredjepart-eksport ikke matcher format'et. Adapter-laget
 * (lib/designs/adapters/{stitch,claude-design}.ts) normaliserer fra andre
 * tools til denne shape før parsing.
 */
import { z } from "zod";

// ── Tokens ──────────────────────────────────────────────────────────────────

const PaletteSchema = z.object({
  accent: z.string(),
  accentDeep: z.string(),
  cream: z.string(),
  sand: z.string(),
  ink: z.string(),
  muted: z.string(),
});

const TokensSchema = z.object({
  prefix: z.string().regex(/^[a-z][a-z0-9]*$/, {
    message: "tokens.prefix skal være kebab-safe lower-case (fx 'cw', 'sol').",
  }),
  palette: PaletteSchema,
  extraTokens: z.record(z.string(), z.string()).optional(),
  fonts: z
    .object({
      sans: z.string().optional(),
      mono: z.string().optional(),
    })
    .optional(),
  /**
   * @keyframes definitioner — emittes til themes/<slug>.css som CSS keyframes
   * når en design importes via codegen.ts. Værdi er full @keyframes body
   * UDEN ledende `@keyframes <name> { ... }`-wrap (kun selve indholdet).
   */
  animations: z.record(z.string(), z.string()).optional(),
});

// ── Section types (discriminated union via `type`) ──────────────────────────

const CtaSchema = z.object({ label: z.string(), href: z.string() });

const HeroSchema = z.object({
  type: z.literal("hero"),
  eyebrow: z.string().optional(),
  headline: z.string(),
  headlineAccent: z.string().optional(),
  tagline: z.string(),
  cta: CtaSchema,
  secondaryCta: CtaSchema.optional(),
  microcopy: z.string().optional(),
});

const ValuePropsSchema = z.object({
  type: z.literal("value-props"),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  items: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .min(1)
    .max(6),
});

const FeatureGridSchema = z.object({
  type: z.literal("feature-grid"),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  items: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .min(1)
    .max(30),
});

const HowItWorksSchema = z.object({
  type: z.literal("how-it-works"),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  items: z
    .array(
      z.object({
        n: z.string(),
        title: z.string(),
        body: z.string(),
        code: z.string().optional(),
      }),
    )
    .min(1)
    .max(6),
});

const StackGridSchema = z.object({
  type: z.literal("stack-grid"),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  items: z.array(z.string()).min(1).max(60),
});

const CtaFooterSchema = z.object({
  type: z.literal("cta-footer"),
  title: z.string(),
  description: z.string().optional(),
  cta: CtaSchema,
  secondaryCta: CtaSchema.optional(),
});

/**
 * "Opaque" section — for design-specific komponenter som UseCases (SaaS Dark)
 * eller HeroVideo (Webshop Classic) som ikke kan udtrykkes deklarativt i
 * YAML. Importes som-is uden re-codegen; codegen.ts beholder den eksisterende
 * komponent. Bruges af built-in designs der har specialiseret rendering.
 */
const OpaqueSchema = z.object({
  type: z.literal("opaque"),
  /** Komponent-navn der allerede findes i designs/<slug>/ eller components/. */
  component: z.string(),
  /** Optional props der passes til komponenten (skal være JSON-serialisable). */
  props: z.record(z.string(), z.unknown()).optional(),
});

const SectionSchema = z.discriminatedUnion("type", [
  HeroSchema,
  ValuePropsSchema,
  FeatureGridSchema,
  HowItWorksSchema,
  StackGridSchema,
  CtaFooterSchema,
  OpaqueSchema,
]);

// ── Top-level design schema ─────────────────────────────────────────────────

export const DesignMdSchema = z.object({
  schema: z.literal("cartwright-design-v1"),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      message:
        "slug skal være kebab-case, starte med bogstav/tal, 1-50 chars.",
    })
    .min(1)
    .max(50),
  name: z.string().min(1).max(80),
  description: z.string().max(280),
  mode: z.enum(["website", "webshop", "both"]),
  premium: z.boolean().optional().default(false),
  tokens: TokensSchema,
  sections: z.array(SectionSchema).min(1).max(20),
});

export type DesignMdSpec = z.infer<typeof DesignMdSchema>;
export type DesignSection = z.infer<typeof SectionSchema>;
