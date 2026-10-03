import { NextRequest } from "next/server";
import { getBrand } from "@/lib/brand";
import { GET as llmsDocument } from "@/app/llms.txt/route";

/**
 * Section-level llms.txt: /{locale}/llms.txt serves the same agent guide
 * scoped to that locale, so an agent exploring a locale subtree finds its
 * index where the llms-txt convention says to look. Unknown locale segments
 * are a real 404 — this route never invents a language the brand doesn't run.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  const brand = await getBrand();
  if (!(brand.locales as readonly string[]).includes(locale)) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(request.url);
  url.pathname = "/llms.txt";
  url.searchParams.set("locale", locale);
  return llmsDocument(new NextRequest(url, { headers: request.headers }));
}
