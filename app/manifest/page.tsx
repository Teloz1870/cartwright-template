import Link from "next/link";
import { brand } from "@/brand.config";

export const metadata = {
  title: `AI-first manifest — ${brand.storeName}`,
  description: `Hvad det betyder at ${brand.storeName} er Danmarks første fuldt AI-styrede webshop.`,
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
            En webshop drevet af AI.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-sol-ink">
            Solbrillen.dk er Danmarks første webshop hvor en AI-agent styrer
            den daglige drift. Det er hverken en marketing-stunt eller et
            eksperiment — det er sådan butikken kører.
          </p>
        </header>

        <section className="space-y-10 text-base leading-7 text-sol-ink">
          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              1. Admin-panelet er valgfrit
            </h2>
            <p>
              Hver funktion i butikken — produkter, kategorier, rabatkoder,
              forsidens banner, ordre-status — er et API-endpoint. Vi har et
              klassisk admin-UI, men det er det sekundære. Det primære er en
              chat hvor ejeren siger “lav en weekendkampagne -20% på sport”, og
              AI’en gør det.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              2. Alt synligt for offentligheden
            </h2>
            <p>
              Vores tool-overflade er offentligt dokumenteret på{" "}
              <Link
                href="/api/v1/tools"
                className="font-bold text-sol-accent underline"
              >
                /api/v1/tools
              </Link>
              . Vores audit-log er offentligt rendret på{" "}
              <Link
                href="/changelog"
                className="font-bold text-sol-accent underline"
              >
                /changelog
              </Link>
              . Du behøver ikke vores ord — du kan se hvad AI gør, mens den
              gør det.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              3. Aldrig magt uden ansvar
            </h2>
            <p>
              Hver destruktiv operation (slet produkt, ændr ordre, opret
              rabatkode) skrives til en audit-log med før-tilstanden snapshot.
              Hvis AI’en laver en fejl, kan vi rulle den tilbage. Kunde-chatten
              har en helt isoleret scope — den kan aldrig kalde admin-tools, og
              vi pen-tester jævnligt for jailbreaks.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              4. Bygget på en åben protokol
            </h2>
            <p>
              Vores AI-flade er bygget på Model Context Protocol (MCP) — den
              åbne standard for at koble AI-klienter til reelle systemer.
              Claude Desktop, andre AI-værktøjer og dine egne scripts kan
              koble sig på via{" "}
              <code className="rounded bg-sol-sand px-1.5 py-0.5 text-xs">
                /api/mcp
              </code>
              .
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-2xl font-black text-sol-accent">
              5. AI hjælper også dig
            </h2>
            <p>
              Når du browser butikken har du adgang til en AI-stylist. Den
              kender hele kataloget og kan finde solbriller der passer til dig:
              ansigtsform, budget, brug. Den må kun læse kataloget og lægge i
              din kurv — aldrig ændre noget. Trygt for dig, ærligt for os.
            </p>
          </div>
        </section>

        <footer className="mt-14 rounded-2xl border-2 border-sol-accent/20 bg-white p-6">
          <h2 className="text-lg font-black text-sol-ink">
            Vil du vide mere?
          </h2>
          <p className="mt-2 text-sm leading-6 text-sol-ink">
            Skriv til{" "}
            <a
              href={`mailto:${brand.emails.support}`}
              className="font-bold text-sol-accent underline"
            >
              {brand.emails.support}
            </a>{" "}
            — vi viser gerne demoen.
          </p>
        </footer>
      </article>
    </div>
  );
}
