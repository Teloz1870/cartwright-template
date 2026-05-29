import { getLocale } from "next-intl/server";

export async function getDynamicTranslation(
  entity: any, 
  field: string, 
  fallback: string = ""
): Promise<string> {
  const locale = await getLocale();
  if (locale === "da") return entity[field] || fallback;

  if (entity.translations && typeof entity.translations === "object") {
    const translations = entity.translations as Record<string, Record<string, string>>;
    if (translations[locale] && translations[locale][field]) {
      return translations[locale][field];
    }
  }

  return entity[field] || fallback;
}
