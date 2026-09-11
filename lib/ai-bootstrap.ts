import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { invalidateBrandCache } from "@/lib/brand";
import { markSetupComplete } from "@/lib/setup-wizard";
import { brand } from "@/brand.config";

/** Locale code → human language name for the bootstrap copy instruction. */
const LOCALE_LANGUAGE: Record<string, string> = {
  en: "English",
  da: "Danish",
  de: "German",
  sv: "Swedish",
  nb: "Norwegian",
  nn: "Norwegian",
  fr: "French",
  es: "Spanish",
  nl: "Dutch",
  it: "Italian",
};

const BootstrapSchema = z.object({
  storeName: z.string().describe("The name of the company/store."),
  tagline: z.string().describe("A catchy one-liner or slogan."),
  announcement: z.string().describe("Top banner text, e.g. 'Free shipping on all orders over $50' or 'Welcome to our new SaaS platform'."),
  themePalette: z.object({
    accent: z.string().describe("Hex code for accent color (CTA, primary buttons)"),
    accentDeep: z.string().describe("Hex code for deep accent (footer, dark backgrounds)"),
    cream: z.string().describe("Hex code for cream (main page background, off-white/light-grey)"),
    sand: z.string().describe("Hex code for sand (card backgrounds)"),
    ink: z.string().describe("Hex code for ink (main body text, dark)"),
    muted: z.string().describe("Hex code for muted text (secondary text)"),
  }).describe("A harmonious 6-color palette tailored to the brand's industry. MUST be valid hex codes."),
  categories: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).min(2).max(4).describe("2-4 logical categories for the business."),
  products: z.array(z.object({
    title: z.string(),
    description: z.string(),
    priceDkk: z.number().describe("Price in ØRE (e.g. 100 DKK = 10000 øre)"),
    categoryIndex: z.number().describe("Index of the category this belongs to (0 to categories.length-1)"),
  })).min(3).max(6).describe("3-6 flagship products or services to populate the store."),
});

export async function bootstrapStoreWithAI(prompt: string) {
  try {
    const model = await chatModel();

    // Write copy in the store's own default language, not a hardcoded one — a
    // fresh English scaffold should not get a Danish store. Falls back to
    // English for any locale we don't have a name for.
    const language = LOCALE_LANGUAGE[brand.defaultLocale] ?? "English";

    const result = await generateObject({
      model,
      schema: BootstrapSchema,
      prompt: `You are an expert brand designer and e-commerce consultant.
      The user wants to start a new business: "${prompt}".

      Generate a complete, ready-to-use store configuration that feels premium, professional, and tailored to the prompt.
      If the prompt is vague, make assumptions to create a stellar default experience.
      Ensure the color palette uses sophisticated, modern combinations (not harsh primary colors).
      Write all copy in ${language} (the store's default language) unless the prompt clearly calls for another language.`,
    });

    const data = result.object;

    // 1. Update BrandingSettings
    await prisma.brandingSettings.upsert({
      where: { id: 1 },
      update: {
        storeName: data.storeName,
        tagline: data.tagline,
        announcement: data.announcement,
        // Identity (mode/ecommerceEnabled) is sovereign from brand.config —
        // never hardcode true (the Phase G footgun: a website-mode shop's row
        // would claim it sells and leak webshop chrome). Matches seed.ts.
        ecommerceEnabled: brand.ecommerceEnabled,
      },
      create: {
        id: 1,
        storeName: data.storeName,
        tagline: data.tagline,
        announcement: data.announcement,
        ecommerceEnabled: brand.ecommerceEnabled,
        heroImage: "",
      },
    });

    // We can't generate the physical theme.css file here easily without node 'fs' and triggering a rebuild,
    // so we will skip physical file generation and assume the app falls back or uses dynamic variables if possible.
    // For now, we just rely on the DB having the values if we implement dynamic injection, or we just generate the categories.

    // 2. Clear existing catalog (since it's a bootstrap)
    await prisma.cartItem.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    // 3. Create Categories
    const createdCategories = [];
    for (const cat of data.categories) {
      const slug = cat.name.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const dbCat = await prisma.category.create({
        data: {
          slug,
          name: cat.name,
          description: cat.description,
          heroImage: "",
        }
      });
      createdCategories.push(dbCat);
    }

    // 4. Create Products
    for (const prod of data.products) {
      const slug = prod.title.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const cat = createdCategories[prod.categoryIndex] || createdCategories[0];
      
      await prisma.product.create({
        data: {
          slug,
          name: prod.title,
          description: prod.description,
          priceDkk: prod.priceDkk,
          categoryId: cat.id,
          images: "[]",
          attributes: JSON.stringify(["AI Generated", "Premium Quality"]),
        }
      });
    }

    invalidateBrandCache();
    await markSetupComplete();

    return { ok: true, data };
  } catch (error) {
    console.error("Bootstrap Error:", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
