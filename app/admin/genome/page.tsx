import { getGenomeForUi } from "./actions";
import { IDENTITY_OPTIONS } from "@/lib/genome/identity";
import { GenomeDashboard } from "./GenomeDashboard";

export const dynamic = "force-dynamic";

export default async function AdminGenomePage() {
  const snapshot = await getGenomeForUi();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Resolvable Genome</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Forretningens copy som ét felt-rum. Sæt de høj-niveau{" "}
          <strong>identity-ankre</strong> (tone, audience, formality, vibe), og{" "}
          <strong>re-harmonisér</strong> for at lade hvert resolvable felt skrive
          sig selv om i den stemme. Render kalder aldrig en LLM — kun knapperne
          her (eller AI-tool'et <code className="rounded bg-sol-ink/5 px-1">genome.*</code>)
          trigger resolution. Tænd under{" "}
          <a href="/admin/features" className="underline">Funktioner</a> (
          <code className="rounded bg-sol-ink/5 px-1">Resolvable Genome</code>) for at
          vise det resolvede på storefront; er det slukket rendres ankrene.
        </p>
      </header>

      <GenomeDashboard snapshot={snapshot} identityOptions={IDENTITY_OPTIONS} />
    </div>
  );
}
