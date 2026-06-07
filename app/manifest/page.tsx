import Link from "next/link";
import { brand } from "@/brand.config";

export const metadata = {
  title: `AI-first manifest — ${brand.storeName}`,
  description: `What it means for ${brand.storeName} to be an AI-first online store.`,
};

export default function ManifestPage() {
  return (
    <div className="min-h-screen bg-sol-cream">
      <article className="container mx-auto max-w-2xl px-4 py-14 sm:py-20">
        <header className="mb-12">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-sol-muted">
            Manifest
          </p>
          <h1 className="mt-3 text-5xl font-black leading-tight text-sol-ink sm:text-6xl">
            An online store powered by AI.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-sol-ink">
            {brand.storeName} is an online store where an AI agent can help run
            day-to-day operations. It is not a marketing stunt or a side
            experiment; it is how this template is built to work.
          </p>
        </header>

        <section className="space-y-10 text-base leading-7 text-sol-ink">
          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              1. The admin panel is optional
            </h2>
            <p>
              Every store function, from products and categories to discount
              codes, homepage banners, and order status, is backed by an API
              endpoint. The classic admin UI is available, but the primary
              workflow can be chat: the owner asks for a campaign, and the AI
              prepares the changes.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              2. Everything is visible
            </h2>
            <p>
              The tool surface is documented at{" "}
              <Link
                href="/api/v1/tools"
                className="font-bold text-sol-accent underline"
              >
                /api/v1/tools
              </Link>
              . The audit log is rendered at{" "}
              <Link
                href="/changelog"
                className="font-bold text-sol-accent underline"
              >
                /changelog
              </Link>
              . You do not have to take our word for it; you can see what the
              AI does as it happens.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              3. Power with accountability
            </h2>
            <p>
              Every destructive operation, such as deleting a product, changing
              an order, or creating a discount code, is written to an audit log
              with a snapshot of the previous state. If the AI makes a mistake,
              the change can be rolled back. Customer chat uses an isolated
              scope and can never call admin tools.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              4. Built on an open protocol
            </h2>
            <p>
              The AI surface is built on Model Context Protocol (MCP), the open
              standard for connecting AI clients to real systems. Claude
              Desktop, other AI tools, and your own scripts can connect via{" "}
              <code className="rounded bg-sol-sand px-1.5 py-0.5 text-xs">
                /api/mcp
              </code>
              .
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              5. AI helps customers too
            </h2>
            <p>
              When customers browse the store, they can use an AI assistant. It
              knows the catalog and can suggest products by needs, budget, and
              use case. It may only read the catalog and add items to the cart;
              it can never change admin data.
            </p>
          </div>
        </section>

        <footer className="mt-14 rounded-2xl border-2 border-sol-accent/20 bg-white p-6">
          <h2 className="text-lg font-black text-sol-ink">
            Want to know more?
          </h2>
          <p className="mt-2 text-sm leading-6 text-sol-ink">
            Write to{" "}
            <a
              href={`mailto:${brand.emails.support}`}
              className="font-bold text-sol-accent underline"
            >
              {brand.emails.support}
            </a>{" "}
            and we will show you the demo.
          </p>
        </footer>
      </article>
    </div>
  );
}
