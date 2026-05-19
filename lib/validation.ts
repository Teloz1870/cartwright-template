import { z } from "zod";

export const checkoutSchema = z.object({
  shippingName: z
    .string()
    .min(2, "Navn skal være mindst 2 tegn"),
  email: z.email("Ugyldig e-mailadresse"),
  shippingAddress: z
    .string()
    .min(3, "Adresse skal være mindst 3 tegn"),
  shippingZip: z
    .string()
    .regex(/^\d{4}$/, "Postnummer skal være 4 cifre"),
  shippingCity: z
    .string()
    .min(2, "By skal være mindst 2 tegn"),
  // Phase 4: telefonnummer er optional (kunde kan tilføje for mobil-lookup
  // ved næste ordre). Accepterer DK-format eller +XX international.
  phoneNumber: z
    .string()
    .regex(/^(\+?\d{1,3})?[\s\-()]*\d{8,12}[\s\-()]*$/, "Ugyldigt telefonnummer")
    .optional(),
  discountCode: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Navn skal være mindst 2 tegn"),
  email: z.email("Ugyldig e-mailadresse"),
  password: z.string().min(8, "Adgangskode skal være mindst 8 tegn"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const productSchema = z.object({
  name: z.string().min(2, "Navn skal være mindst 2 tegn"),
  slug: z
    .string()
    .min(2, "Slug skal være mindst 2 tegn")
    .regex(/^[a-z0-9-]+$/, "Slug må kun indeholde små bogstaver, tal og bindestreger"),
  description: z.string().min(10, "Beskrivelse skal være mindst 10 tegn"),
  priceKr: z.coerce.number().positive("Pris skal være større end 0"),
  stock: z.coerce.number().int().min(0, "Lager kan ikke være negativt"),
  // P1.2: Optional fordi non-eyewear shops (panel-hegn etc.) ikke har dem.
  // Tom string normaliseres til null i admin/actions.ts før Prisma-skrivning.
  frameColor: z.string().optional().default(""),
  lensColor: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  categoryId: z.string().min(1, "Vælg en kategori"),
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
            message: "Attributes skal være et JSON-objekt: {\"key\": \"value\"}",
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
              message: `Attributes-key "${k}" er reserveret og må ikke bruges`,
            });
            return z.NEVER;
          }
          // Kun string-values for nu — keep simple. Tal/bools kan konverteres
          // til strings i admin hvis nødvendigt.
          if (typeof v !== "string") {
            ctx.addIssue({
              code: "custom",
              message: `Attributes-værdi "${k}" skal være en tekst-streng`,
            });
            return z.NEVER;
          }
          safe[k] = v;
        }
        return safe;
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Attributes skal være gyldig JSON",
        });
        return z.NEVER;
      }
    }),
});

export type ProductInput = z.infer<typeof productSchema>;

export const discountCodeSchema = z.object({
  code: z
    .string()
    .min(3, "Kode skal være mindst 3 tegn")
    .trim()
    .transform((s) => s.toUpperCase()),
  type: z.enum(["percent", "fixed"], { error: "Ugyldig rabattype" }),
  value: z.coerce.number().positive("Værdi skal være større end 0"),
});

export type DiscountCodeInput = z.infer<typeof discountCodeSchema>;

export const pageSchema = z.object({
  slug: z
    .string()
    .min(2, "Slug skal være mindst 2 tegn")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug må kun indeholde små bogstaver, tal og bindestreger",
    ),
  title: z.string().min(2, "Titel skal være mindst 2 tegn"),
  body: z.string().min(10, "Indhold skal være mindst 10 tegn"),
});

export type PageInput = z.infer<typeof pageSchema>;

export const categorySchema = z.object({
  name: z.string().min(2, "Navn skal være mindst 2 tegn"),
  slug: z
    .string()
    .min(2, "Slug skal være mindst 2 tegn")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug må kun indeholde små bogstaver, tal og bindestreger",
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
    .regex(/^https?:\/\//, "heroImage skal være en https://-URL")
    .or(z.literal(""))
    .optional(),
  // Video Pilot: hero-video URL. Samme XSS-guard som heroImage (kun http(s)).
  // Anbefales mp4 til bredeste browser-support (Safari + iOS).
  heroVideo: z
    .string()
    .regex(/^https?:\/\//, "heroVideo skal være en https://-URL (mp4 anbefales)")
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
            message: "FAQ skal være et JSON-array",
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "FAQ skal være gyldig JSON",
        });
      }
    }),
});

export type CategoryInput = z.infer<typeof categorySchema>;
