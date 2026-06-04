import { getLocale } from "next-intl/server";
import { brand } from "@/brand.config";

export async function getDynamicTranslation(
  entity: { [key: string]: unknown; translations?: unknown },
  field: string,
  fallback: string = ""
): Promise<string> {
  const locale = await getLocale();
  // Base-locale (kildeteksten) kommer fra brand.config, ikke hardkodet "da".
  if (locale === brand.defaultLocale) return (entity[field] as string) || fallback;

  const t = entity.translations;
  if (t && typeof t === "object") {
    const translations = t as Record<string, Record<string, string>>;
    const v = translations[locale]?.[field];
    if (typeof v === "string" && v) return v;
  }

  return (entity[field] as string) || fallback;
}
