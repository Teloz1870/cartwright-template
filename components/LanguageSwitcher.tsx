"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function onSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value;
    console.log("[LanguageSwitcher] onSelectChange:", {
      locale,
      pathname,
      nextLocale,
    });
    // router.replace skifter locale, men beholder den aktuelle route (pathname)
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="flex items-center">
      <select
        value={locale}
        onChange={onSelectChange}
        className="appearance-none bg-transparent text-sm font-bold outline-none cursor-pointer text-inherit hover:opacity-70 transition-opacity"
      >
        <option value="da" className="text-black dark:text-white dark:bg-black">🇩🇰 DA</option>
        <option value="en" className="text-black dark:text-white dark:bg-black">🇬🇧 EN</option>
      </select>
    </div>
  );
}
