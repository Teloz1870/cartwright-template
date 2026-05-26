import { z } from "zod";

export const checkoutSchema = z.object({
  shippingName: z
    .string()
    .min(2, "Name must be at least 2 characters"),
  email: z.email("Invalid email address"),
  shippingAddress: z
    .string()
    .min(3, "Address must be at least 3 characters"),
  shippingZip: z
    .string()
    .regex(/^\d{4}$/, "Postcode must be 4 digits"),
  shippingCity: z
    .string()
    .min(2, "City must be at least 2 characters"),
  // Phase 4: telefonnummer er optional (kunde kan tilføje for mobil-lookup
  // ved næste ordre). Accepterer DK-format eller +XX international.
  phoneNumber: z
    .string()
    .regex(/^(\+?\d{1,3})?[\s\-()]*\d{8,12}[\s\-()]*$/, "Invalid phone number")
    .optional(),
  discountCode: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priceKr: z.coerce.number().positive("Price must be greater than 0"),
  stock: z.coerce.number().int().min(0, "Stock cannot be negative"),
  // P1.2: Optional fordi non-eyewear shops (panel-hegn etc.) ikke har dem.
  // Tom string normaliseres til null i admin/actions.ts før Prisma-skrivning.
  frameColor: z.string().optional().default(""),
  lensColor: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  categoryId: z.string().min(1, "Select a category"),
  featured: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
  images: z.string().optional().default(""),
  // Shop-Starter Task G: optional JSON-blob med custom attributes for
  // fork-shops (panel-hegn dimensions/material, landbrug vægt/oprindelse).
  // Admin indtaster som JSON-streng via textarea — vi parser her.
  // Tom string → null (intet attributes-blob).
  attributes: z
    .string()
    .optional()
    .default("")
    .transform((raw, ctx): Record<string, string> | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Attributes must be a JSON object: {\"key\": \"value\"}",
          });
          return z.NEVER;
        }
        // Prototype-pollution guard (Gemini-review MED): JSON.parse bevarer
        // __proto__/constructor/prototype som own-properties hvis de er
        // eksplicit angivet — Object.entries vil iterere dem og kan forårsage
        // logic-bugs downstream. Whitelist sikre keys, skip dangerous ones.
        const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
        const safe: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (DANGEROUS_KEYS.has(k)) {
            ctx.addIssue({
              code: "custom",
              message: `Attribute key "${k}" is reserved and cannot be used`,
            });
            return z.NEVER;
          }
          // Kun string-values for nu — keep simple. Tal/bools kan konverteres
          // til strings i admin hvis nødvendigt.
          if (typeof v !== "string") {
            ctx.addIssue({
              code: "custom",
              message: `Attribute value "${k}" must be a text string`,
            });
            return z.NEVER;
          }
          safe[k] = v;
        }
        return safe;
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Attributes must be valid JSON",
        });
        return z.NEVER;
      }
    }),
  translations: z
    .string()
    .optional()
    .default("")
    .transform((raw, ctx) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          ctx.addIssue({ code: "custom", message: "Translations must be a JSON object" });
          return z.NEVER;
        }
        return parsed;
      } catch {
        ctx.addIssue({ code: "custom", message: "Translations must be valid JSON" });
        return z.NEVER;
      }
    }),
});

export type ProductInput = z.infer<typeof productSchema>;

export const discountCodeSchema = z.object({
  code: z
    .string()
    .min(3, "Code must be at least 3 characters")
    .trim()
    .transform((s) => s.toUpperCase()),
  type: z.enum(["percent", "fixed"], { error: "Invalid discount type" }),
  value: z.coerce.number().positive("Value must be greater than 0"),
});

export type DiscountCodeInput = z.infer<typeof discountCodeSchema>;

export const pageSchema = z.object({
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),
  title: z.string().min(2, "Title must be at least 2 characters"),
  body: z.string().optional().default(""),
  translations: z
    .string()
    .optional()
    .default("")
    .transform((raw, ctx) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          ctx.addIssue({ code: "custom", message: "Translations must be a JSON object" });
          return z.NEVER;
        }
        return parsed;
      } catch {
        ctx.addIssue({ code: "custom", message: "Translations must be valid JSON" });
        return z.NEVER;
      }
    }),
});

export type PageInput = z.infer<typeof pageSchema>;

export const categorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),
  description: z.string().optional(),
  // Phase 8 Task B: per-kategori hero-image URL. Optional — fallback til
  // CATEGORY_IMAGES[slug] hardcoded mapping. Accepter både https-URL og
  // tom-string (treats som null på storage-side).
  // SECURITY: z.url() er for permissiv — accepterer javascript:/data: URIs
  // som ville være XSS-vektor i <Image src={...}>. Strict http(s)-only regex.
  // (Fund: Gemini Phase 8-review, HIGH-severity.)
  heroImage: z
    .string()
    .regex(/^https?:\/\//, "heroImage must be an https:// URL")
    .or(z.literal(""))
    .optional(),
  // Video Pilot: hero-video URL. Samme XSS-guard som heroImage (kun http(s)).
  // Anbefales mp4 til bredeste browser-support (Safari + iOS).
  heroVideo: z
    .string()
    .regex(/^https?:\/\//, "heroVideo must be an https:// URL (mp4 recommended)")
    .or(z.literal(""))
    .optional(),
  // SEO Task A/B: rich kategori-content. Alle nullable så fork-shops kan starte
  // uden og fylde via AI-magic-button. FAQ er JSON-array men gemmes som streng
  // i DB — vi validerer JSON-format her uden at parse til typed objekt.
  metaTitle: z.string().max(120).optional(),
  metaDescription: z.string().max(300).optional(),
  descriptionLong: z.string().max(10000).optional(),
  faq: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val || !val.trim()) return;
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) {
          ctx.addIssue({
            code: "custom",
            message: "FAQ must be a JSON array",
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "FAQ must be valid JSON",
        });
      }
    }),
  translations: z
    .string()
    .optional()
    .default("")
    .transform((raw, ctx) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          ctx.addIssue({ code: "custom", message: "Translations must be a JSON object" });
          return z.NEVER;
        }
        return parsed;
      } catch {
        ctx.addIssue({ code: "custom", message: "Translations must be valid JSON" });
        return z.NEVER;
      }
    }),
});

export type CategoryInput = z.infer<typeof categorySchema>;
