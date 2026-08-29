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
  // Self-contained styling: this handler bypasses the app layout entirely, so
  // without it the page rendered as raw UA-default HTML — under a dark OS
  // color-scheme that meant near-black-on-black recovery links. Explicit
  // colors, no external CSS, dignified in every browser.
  const html404Style =
    "<style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f2ec;color:#221c14;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:32rem;padding:3rem 1.5rem}h1{font-size:1.6rem;margin:0 0 .5rem}code{background:#e9e2d6;border-radius:4px;padding:.1em .4em;font-size:.9em}ul{list-style:none;margin:1.5rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}a{display:inline-block;border:1px solid #c9bda9;border-radius:999px;padding:.4em 1em;color:#221c14;text-decoration:none;font-weight:600;font-size:.85rem}a:hover{border-color:#221c14}</style>";
  return new Response(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found</title>${html404Style}</head><body><main><h1>Page not found</h1><p>We could not find <code>${requested.replace(/[&<>"']/g, "")}</code>.</p><nav aria-label="Recovery links"><ul>${htmlLinks}</ul></nav></main></body></html>`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Vary": "Accept, Accept-Encoding", "Cache-Control": "no-store" },
  });
}

export const HEAD = GET;
