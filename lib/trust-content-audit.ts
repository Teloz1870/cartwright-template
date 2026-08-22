import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";

export type TrustContentFinding = {
  page: "about" | "contact" | "privacy" | "company";
  message: string;
};

const PLACEHOLDER = /\b(todo|tbd|lorem ipsum|replace this|add your|demo page|placeholder)\b/i;
const MIN_TRUST_CHARACTERS = 500;

export async function auditTrustContent(): Promise<TrustContentFinding[]> {
  const findings: TrustContentFinding[] = [];
  const pages = await prisma.page.findMany({
    where: { slug: { in: ["about", "contact", "privacy"] }, status: "published" },
    select: { slug: true, body: true },
  }).catch(() => [] as { slug: string; body: string }[]);

  for (const slug of ["about", "contact", "privacy"] as const) {
    const page = pages.find((candidate) => candidate.slug === slug);
    if (!page) {
      findings.push({ page: slug, message: `Publish a substantive /${slug} CMS page before launch.` });
      continue;
    }
    const text = page.body.replace(/[#*`>\-_]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < MIN_TRUST_CHARACTERS) findings.push({ page: slug, message: `/${slug} is only ${text.length} characters; aim for at least ${MIN_TRUST_CHARACTERS}.` });
    if (PLACEHOLDER.test(text)) findings.push({ page: slug, message: `/${slug} still contains placeholder language.` });
  }

  if (!brand.company.legalName.trim()) findings.push({ page: "company", message: "Add the legal company name in brand.config.ts." });
  if (!brand.company.address.trim() || !brand.company.postalCode.trim() || !brand.company.city.trim()) findings.push({ page: "company", message: "Complete street, postal code and city in brand.company." });
  if (
    brand.storeSlug !== "cartwright" &&
    brand.company.sameAs.some((url) => /github\.com\/Teloz1870\/cartwright-template|npmjs\.com\/package\/create-cartwright/i.test(url))
  ) findings.push({ page: "company", message: "Replace Cartwright's default company.sameAs profiles with this fork's official authority profiles." });
  if (!brand.contact.email.trim()) findings.push({ page: "contact", message: "Add a public support email in brand.contact." });
  return findings;
}
