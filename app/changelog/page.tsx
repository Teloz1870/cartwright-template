import { listAuditEntries } from "@/lib/audit";
import Link from "next/link";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Menneske-læselige labels per tool-navn. Når et nyt tool tilføjes der bør
// vises på /changelog, opdater denne tabel. Tools uden label vises ikke.
const TOOL_LABELS: Record<string, string> = {
  "products.create": "oprettede et nyt produkt",
  "products.update": "opdaterede et produkt",
  "products.delete": "fjernede et produkt",
  "categories.upsert": "ændrede en kategori",
  "categories.delete": "slettede en kategori",
  "pages.upsert": "redigerede en indholds-side",
  "pages.delete": "slettede en indholds-side",
  "orders.update_status": "ændrede status på en ordre",
  "discounts.create": "oprettede en rabatkode",
  "discounts.toggle": "aktiverede/deaktiverede en rabatkode",
  "settings.update_shipping": "ændrede fragt-priser",
  "settings.update_branding": "opdaterede forsidens banner",
  "marketing.create_campaign": "kørte en marketing-kampagne",
  "marketing.create_campaign:discount": "oprettede rabatkode som del af kampagne",
  "marketing.create_campaign:announcement": "ændrede forsidens banner som del af kampagne",
  "audit.revert": "rullede en tidligere ændring tilbage",
};

function actorLabel(raw: string): string {
  if (raw.startsWith("apikey:")) return "AI (via API-key)";
  if (raw.startsWith("user:")) return "Et menneske";
  if (raw.startsWith("storefront-chat:")) return "AI-stylisten på forsiden";
  if (raw.startsWith("system:")) return "System-job";
  return "Ukendt aktør";
}

export default async function ChangelogPage() {
  // Hent rigeligt så vi har noget at vise selv ved tom DB
  const entries = await listAuditEntries({ limit: 200, onlyOk: true });

  // Filtrér til kun ændringer vi har labels for (ingen read-only kald)
  const visible = entries.filter((e) => TOOL_LABELS[e.tool]);

  return (
    <div className="min-h-screen bg-sol-cream">
      <div className="container mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-sol-muted">
            Live audit-feed
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-sol-ink sm:text-5xl">
            Hvad har AI lavet i dag?
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-sol-ink">
            Solbrillen.dk er Danmarks første webshop hvor AI styrer driften.
            Hver ændring AI’en laver — fra rabatkoder til produktopdateringer —
            logges her, så enhver kan kigge med. Ingen filter, ingen redigering.
          </p>
        </header>

        {visible.length === 0 ? (
          <section className="rounded-2xl border-2 border-dashed border-sol-ink/20 bg-white p-8 text-center">
            <p className="text-sm font-bold text-sol-muted">
              Ingen ændringer endnu i dag. Kom tilbage senere, eller følg vores
              tools live på{" "}
              <Link
                href="/api/v1/tools"
                className="text-sol-accent underline"
              >
                /api/v1/tools
              </Link>
              .
            </p>
          </section>
        ) : (
          <ol className="flex flex-col gap-3">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-sol-ink/10 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-sol-ink">
                      <strong className="font-black">
                        {actorLabel(entry.actor)}
                      </strong>{" "}
                      {TOOL_LABELS[entry.tool]}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-sol-muted">
                      {entry.tool}
                    </p>
                  </div>
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-xs text-sol-muted"
                  >
                    {dateFormatter.format(entry.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-12 rounded-2xl bg-sol-accent px-6 py-8 text-white">
          <h2 className="text-xl font-black">Vil du selv se under motorhjelmen?</h2>
          <p className="mt-2 text-sm leading-6 text-white/85">
            Hele tool-paletten er offentligt dokumenteret. Klienter — fra Claude
            Desktop til dine egne scripts — kan opdage og kalde dem via MCP og
            REST.
          </p>
          <ul className="mt-4 space-y-1 text-sm">
            <li>
              📘 Tool-katalog:{" "}
              <Link
                href="/api/v1/tools"
                className="font-bold underline hover:text-sol-sun"
              >
                /api/v1/tools
              </Link>
            </li>
            <li>
              🤖 AI-manifest:{" "}
              <a href="/manifest" className="font-bold underline hover:text-sol-sun">
                /manifest
              </a>
            </li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
