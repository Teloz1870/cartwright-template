"use client";

import { useLocale } from "next-intl";
import { routing, useRouter, usePathname } from "@/i18n/routing";

// Flag + short label per locale; falls back to the uppercased code so adding a
// locale to brand.locales "just works" without editing this map.
const LOCALE_LABELS: Record<string, string> = {
  da: "🇩🇰 DA",
  en: "🇬🇧 EN",
  de: "🇩🇪 DE",
  sv: "🇸🇪 SV",
  nb: "🇳🇴 NB",
  nn: "🇳🇴 NN",
  fr: "🇫🇷 FR",
  es: "🇪🇸 ES",
  nl: "🇳🇱 NL",
  it: "🇮🇹 IT",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Single-locale shops have nothing to switch — never render a control that
  // routes to an unconfigured locale (e.g. /da → 404 on a locales:["en"] site).
  if (routing.locales.length <= 1) return null;

  function onSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value;
    // router.replace skifter locale, men beholder den aktuelle route (pathname)
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="flex items-center">
      <label htmlFor="language-switcher" className="sr-only">
        {locale === "en" ? "Select language" : "Vælg sprog"}
      </label>
      <select
        id="language-switcher"
        value={locale}
        onChange={onSelectChange}
        aria-label={locale === "en" ? "Select language" : "Vælg sprog"}
        className="appearance-none bg-transparent text-sm font-bold outline-none cursor-pointer text-inherit hover:opacity-70 transition-opacity"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc} className="text-black dark:text-white dark:bg-black">
            {LOCALE_LABELS[loc] ?? loc.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
