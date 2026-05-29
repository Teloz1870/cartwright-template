import {getRequestConfig} from 'next-intl/server';
import {routing} from './routing';
import {getBrand} from '@/lib/brand';
 
export default getRequestConfig(async ({requestLocale}) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;
 
  const brand = await getBrand().catch(() => ({ defaultLocale: "da" }));
  const defaultLocale = brand.defaultLocale || routing.defaultLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = defaultLocale;
  }
 
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
