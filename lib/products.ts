/** Parser den JSON-array-streng af billed-URLs der gemmes på Product.images. */
export function parseProductImages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
