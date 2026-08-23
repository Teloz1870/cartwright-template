import type { Metadata } from "next";
import InfoPage, { generateMetadata as infoMetadata } from "@/app/[locale]/info/[slug]/page";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ locale }, brand] = await Promise.all([params, getBrand()]);
  const base = await infoMetadata({ params: Promise.resolve({ locale, slug: "about" }) });
  return { ...base, alternates: { canonical: `${brand.url.replace(/\/+$/, "")}/${locale}/about`, languages: hreflangFor("/{locale}/about", brand.url) } };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  return InfoPage({ params: Promise.resolve({ locale, slug: "about" }) });
}
