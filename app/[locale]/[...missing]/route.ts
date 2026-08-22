import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";

export const dynamic = "force-dynamic";

function acceptsMarkdown(request: Request): boolean {
  return request.headers.get("accept")
    ?.split(",")
    .some((value) => value.trim().split(";")[0] === "text/markdown") ?? false;
}

export function buildRecoveryLinks(
  locale: string,
  ecommerceEnabled: boolean = brand.ecommerceEnabled,
  agentApi: boolean = profileCapabilities.agentApi,
): string {
  return [
    `- [Homepage](/${locale})`,
    "- [Sitemap](/sitemap.xml)",
    "- [Agent instructions](/llms.txt)",
    ...(agentApi ? [`- [Developer documentation](/${locale}/developers)`] : []),
    ...(ecommerceEnabled ? [`- [Product catalogue](/${locale}/produkter)`] : []),
  ].join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; missing: string[] }> },
) {
  const { locale, missing } = await params;
  const requested = `/${locale}/${missing.join("/")}`;
  const links = buildRecoveryLinks(locale);

  if (acceptsMarkdown(request)) {
    return new Response(`# 404 — Not found\n\nNo public page exists at \`${requested}\`.\n\n${links}\n`, {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Vary": "Accept, Accept-Encoding",
        "Cache-Control": "no-store",
      },
    });
  }

  const htmlLinks = links
    .split("\n")
    .map((line) => line.replace(/^- \[([^\]]+)]\(([^)]+)\)$/, '<li><a href="$2">$1</a></li>'))
    .join("");
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found</title></head><body><main><h1>Page not found</h1><p>We could not find <code>${requested.replace(/[&<>"']/g, "")}</code>.</p><nav aria-label="Recovery links"><ul>${htmlLinks}</ul></nav></main></body></html>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Vary": "Accept, Accept-Encoding", "Cache-Control": "no-store" },
  });
}

export const HEAD = GET;
