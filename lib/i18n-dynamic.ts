import { getLocale } from "next-intl/server";
import { brand } from "@/brand.config";

export async function getDynamicTranslation(
  entity: { [key: string]: unknown; translations?: unknown },
  field: string,
  fallback: string | null | undefined = "",
  localeOverride?: string
): Promise<string> {
  const locale = localeOverride ?? (await getLocale());
  const baseValue =
    typeof entity[field] === "string" ? (entity[field] as string) : (fallback ?? "");
  // Base-locale (kildeteksten) kommer fra brand.config, ikke hardkodet "da".
  if (locale === brand.defaultLocale) return baseValue;

  const t = entity.translations;
  if (t && typeof t === "object") {
    const translations = t as Record<string, Record<string, string>>;
    const v = translations[locale]?.[field];
    if (typeof v === "string" && v) return v;
  }

  return baseValue;
}
