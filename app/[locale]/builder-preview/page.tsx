import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { requireAdmin } from "@/lib/admin";
import BuilderPreviewClient from "./BuilderPreviewClient";

/**
 * Visual Builder — live-preview-target (renders inde i storefront-layoutet, så
 * temaet/CSS er ægte). Dobbelt-gated: requireAdmin() + feature-flag, så ruten er
 * inert med flag off (alle canaries) og utilgængelig for ikke-admins.
 *
 * Selve draft-træet kommer fra builder-vinduet via sessionStorage (same-origin)
 * + postMessage — ingen server-draft-state, ingen ekstra DB-kolonne.
 */
export default async function BuilderPreviewPage() {
  await requireAdmin();
  if (!brand.features.visualBuilderEnabled) notFound();
  return <BuilderPreviewClient />;
}
