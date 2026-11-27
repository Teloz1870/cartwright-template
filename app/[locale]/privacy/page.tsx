import type { Metadata } from "next";
import {
  buildPublicInfoMetadata,
  renderPublicInfoPage,
} from "@/app/[locale]/info/[slug]/page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildPublicInfoMetadata({ locale, publicSlug: "privacy" });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  return renderPublicInfoPage({ locale, publicSlug: "privacy" });
}
