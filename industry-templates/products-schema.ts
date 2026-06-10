import { z } from "zod";

export const seedProductSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string(),
  priceDkk: z.number().int().nonnegative(),
  images: z.array(z.string().url()),
  stock: z.number().int().nonnegative(),
  frameColor: z.string().optional(),
  lensColor: z.string().optional(),
  brand: z.string().optional(),
  categorySlug: z.string().min(1),
  featured: z.boolean().optional(),
});

export const productsJsonSchema = z.array(seedProductSchema);
