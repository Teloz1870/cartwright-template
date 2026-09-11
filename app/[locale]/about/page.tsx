import type { Metadata } from "next";
import { publicPageSourceSlugs } from "@/lib/canonical-public-routes";
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
    // Older ecommerce seeds use the Danish source slug in every locale. The
    // canonical route stays predictable while preserving their story — and the
    // set is derived, so the agent tool surface cannot drift away from it.
    sourceSlugs: publicPageSourceSlugs("about"),
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  return renderPublicInfoPage({
    locale,
    publicSlug: "about",
    sourceSlugs: publicPageSourceSlugs("about"),
  });
}
