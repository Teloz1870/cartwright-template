import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { VERTICAL_OPTIONS } from "@/verticals/options";
import { AdminPageHeader } from "@/components/admin/ui";
import { VerticalsPanel } from "./VerticalsPanel";

export const dynamic = "force-dynamic";

/**
 * /admin/verticals — Vertical / Voice presets (the "pre-genome" layer). Apply a
 * packaged brand voice (nursery, carpenter, café…) to re-tone the homepage,
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
            Packaged <strong>industry voices</strong> (nursery, carpenter, café, salon). Apply one to
            re-tone the homepage copy + identity anchors in seconds — without an LLM (the copy is
            written up front). A Voice is <strong>orthogonal to the design</strong>: mix any
            voice with any (mixable) skin. “Voice + Skin” also sets the
            suggested design. Shown live on the homepage when{" "}
            <Link href="/admin/genome" className="underline">
              Resolvable Genome
            </Link>{" "}
            is enabled.
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
