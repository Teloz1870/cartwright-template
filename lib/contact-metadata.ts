import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";
import { pageOg } from "@/lib/og";

/** Locale-aware contact metadata derived from the operator's runtime brand URL. */
export async function buildContactMetadata(locale: string): Promise<Metadata> {
  const resolved = await getBrand();
  const base = resolved.url.replace(/\/+$/, "");
  const title = locale === "da" ? "Kontakt & Kundeservice" : "Contact & Support";
  const description =
    locale === "da"
      ? `Kontakt ${resolved.storeName} — spørgsmål, support og henvendelser.`
      : `Contact ${resolved.storeName} for questions, support and inquiries.`;

  return {
    title,
    description,
    ...pageOg(title, description),
    alternates: {
      canonical: `${base}/${locale}/contact`,
      languages: hreflangFor("/{locale}/contact", resolved.url),
    },
  };
}
