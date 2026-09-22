import { getLocale } from "next-intl/server";
import { translatedField } from "@/lib/translated-field";

/**
 * Ambient-locale wrapper around `translatedField`. Use this from rendering
 * paths that sit inside a next-intl request context; pass `localeOverride`
 * (or call `translatedField` directly) from routes and tools that already
 * carry an explicit locale.
 */
export async function getDynamicTranslation(
  entity: { [key: string]: unknown; translations?: unknown },
  field: string,
  fallback: string | null | undefined = "",
  localeOverride?: string
): Promise<string> {
  const locale = localeOverride ?? (await getLocale());
  return translatedField(entity, field, locale, fallback);
}
