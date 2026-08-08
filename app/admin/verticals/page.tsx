import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { VERTICAL_OPTIONS } from "@/verticals/options";
import { AdminPageHeader } from "@/components/admin/ui";
import { VerticalsPanel } from "./VerticalsPanel";

export const dynamic = "force-dynamic";

/**
 * /admin/verticals — Vertical / Voice presets (the "pre-genome" layer). Apply a
 * packaged brand voice (børnehave, tømrer, café…) to re-tone the homepage,
 * optionally with its suggested design. Orthogonal to the Skin — mix freely.
 */
export default async function AdminVerticalsPage() {
  await requireAdmin();
  const features = await getFeatures();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title="Verticals (Voice)"
        subtitle={
          <>
            Pakkede <strong>branche-stemmer</strong> (børnehave, tømrer, café, salon). Anvend én for
            at gen-tone forsidens copy + identitets-ankre på sekunder — uden en LLM (teksten er
            skrevet på forhånd). En Voice er <strong>ortogonal til designet</strong>: bland en hvilken
            som helst stemme med et hvilket som helst (mixbart) skin. “Voice + Skin” sætter også det
            foreslåede design. Vises live på forsiden når{" "}
            <Link href="/admin/genome" className="underline">
              Resolvable Genome
            </Link>{" "}
            er tændt.
          </>
        }
      />
      <VerticalsPanel
        verticals={VERTICAL_OPTIONS}
        genomeResolveOn={Boolean(features.genomeResolve)}
      />
    </div>
  );
}
