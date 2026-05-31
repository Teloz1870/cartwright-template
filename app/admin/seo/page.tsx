import { getSeoForUi } from "./actions";
import { SeoForm } from "./SeoForm";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  const settings = await getSeoForUi();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">SEO & indeksering</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Styr om sitet må indekseres af søgemaskiner og AI-crawlere. Ændringer
          slår igennem på <code className="rounded bg-sol-ink/5 px-1">/robots.txt</code>{" "}
          inden for 30 sekunder.
        </p>
      </header>
      <SeoForm initial={settings} />
    </div>
  );
}
