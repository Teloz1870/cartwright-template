import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";
import { publicAgentTools } from "@/lib/tools/public";
import { listTools } from "@/lib/tools/registry";
import { PUBLIC_AGENT_RATE_LIMIT } from "@/lib/rate-limit";
import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ locale }, brand] = await Promise.all([params, getBrand()]);
  const canonical = `${brand.url.replace(/\/$/, "")}/${locale}/developers`;
  return {
    title: `Developers | ${brand.storeName}`,
    description: `MCP, REST, OpenAPI, authentication and rate-limit documentation for ${brand.storeName}.`,
    alternates: { canonical, languages: hreflangFor("/{locale}/developers", brand.url) },
  };
}

export default async function DevelopersPage({ params }: Props) {
  const [{ locale }, brand] = await Promise.all([params, getBrand()]);
  const da = locale === "da";
  const base = brand.url.replace(/\/$/, "");
  const anonymousTools = publicAgentTools(listTools());
  const example = `curl -X POST ${base}/api/v1/tools/products.search \\\n+  -H 'Content-Type: application/json' \\\n+  -d '{"q":"aviator","limit":5}'`;

  return (
    <article className="mx-auto max-w-4xl px-6 py-16 text-sol-ink">
      <header>
        <p className="font-semibold uppercase tracking-widest text-sol-accent">Agent API</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {da ? "Udviklere og AI-agenter" : "Developers and AI agents"}
        </h1>
        <p className="mt-5 max-w-3xl text-lg text-sol-muted">
          {da
            ? "Browse offentligt indhold anonymt. Private data og alle handlinger kræver en scope-begrænset API-nøgle."
            : "Browse public content anonymously. Private data and every action require a scope-restricted API key."}
        </p>
      </header>

      <nav aria-label={da ? "Udviklerdokumentation" : "Developer documentation"} className="my-10 rounded-xl border border-sol-border p-5">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 underline">
          <li><a href="#mcp">MCP</a></li><li><a href="#rest">REST</a></li>
          <li><a href="#auth">Auth & scopes</a></li><li><a href="#limits">Rate limits</a></li>
          <li><a href="#errors">Errors</a></li>
        </ul>
      </nav>

      <section id="mcp" className="mt-12">
        <h2 className="text-2xl font-bold">Model Context Protocol</h2>
        <p className="mt-3">Streamable HTTP endpoint: <Link className="underline" href="/api/mcp"><code>/api/mcp</code></Link>. Server card: <a className="underline" href="/.well-known/mcp.json"><code>/.well-known/mcp.json</code></a>.</p>
        <p className="mt-3">{da ? "Anonyme klienter opdager kun:" : "Anonymous clients discover only:"}</p>
        <ul className="mt-2 list-disc pl-6">{anonymousTools.map((tool) => <li key={tool.name}><code>{tool.name}</code></li>)}</ul>
      </section>

      <section id="rest" className="mt-12">
        <h2 className="text-2xl font-bold">REST & OpenAPI 3.1</h2>
        <p className="mt-3">POST <code>/api/v1/tools/&lt;tool.name&gt;</code>. <a className="underline" href="/openapi.json">{da ? "Åbn det genererede OpenAPI-dokument" : "Open the generated OpenAPI document"}</a>.</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-sol-ink p-5 text-sm text-white"><code>{example}</code></pre>
      </section>

      <section id="auth" className="mt-12">
        <h2 className="text-2xl font-bold">{da ? "Godkendelse og scopes" : "Authentication and scopes"}</h2>
        <p className="mt-3">{da ? "Send" : "Send"} <code>Authorization: Bearer sb_live_…</code>. {da ? "Nøglen får aldrig flere rettigheder end de scopes, ejeren har tildelt. Writes, kunder, ordrer, checkout og administration er aldrig anonyme." : "The key never receives more access than its owner-assigned scopes. Writes, customers, orders, checkout and administration are never anonymous."}</p>
      </section>

      <section id="limits" className="mt-12">
        <h2 className="text-2xl font-bold">Rate limits</h2>
        <p className="mt-3">{da ? `Anonyme requests har en burst-grænse på ${PUBLIC_AGENT_RATE_LIMIT} pr. IP og genopfyldes løbende.` : `Anonymous requests have a burst allowance of ${PUBLIC_AGENT_RATE_LIMIT} per IP and refill continuously.`} Responses include <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code> and <code>RateLimit-Policy</code>. A 429 also includes <code>Retry-After</code>.</p>
      </section>

      <section id="errors" className="mt-12">
        <h2 className="text-2xl font-bold">Problem details</h2>
        <p className="mt-3">Errors use <code>application/problem+json</code> with <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>, <code>instance</code>, <code>code</code> and <code>resolution</code>. The legacy <code>ok</code>/<code>error</code> fields remain for one compatibility window.</p>
      </section>

      <footer className="mt-14 border-t border-sol-border pt-6">
        <a className="underline" href="/llms.txt">llms.txt</a> · <a className="underline" href="/sitemap.xml">sitemap.xml</a>
      </footer>
    </article>
  );
}
