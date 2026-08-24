import type { Metadata } from "next";
import {
  buildPublicInfoMetadata,
  renderPublicInfoPage,
} from "@/app/[locale]/info/[slug]/page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildPublicInfoMetadata({
    locale,
    publicSlug: "about",
    // Older ecommerce seeds use the Danish source slug in every locale.
    // The canonical route stays predictable while preserving their story.
    sourceSlugs: ["about", "om-os"],
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  return renderPublicInfoPage({
    locale,
    publicSlug: "about",
    sourceSlugs: ["about", "om-os"],
  });
}
