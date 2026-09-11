import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import CasesClient from "./CasesClient";

/**
 * Cases-siden er ren agency/SaaS-marketing (live-cases på Cartwright-
 * konsulent-arbejdet). Ingen forretningsmæssig værdi for ecommerce-shops,
 * og hardcoded dark-mode + Cartwright-branding bryder fresh-fork-shop's
 * design. Gate route bag isSaas så ecommerce-mode shops returnerer 404.
 *
 * Teloz-fork (industryTemplate: "saas", ecommerceEnabled: false) får
 * stadig den fulde marketing-side.
 */
export default async function CasesPage() {
  const isSaas =
    !brand.ecommerceEnabled && brand.industryTemplate === "saas";
  if (!isSaas) notFound();
  // Mixer 2.0 Phase 4 — designSurfaces: re-tone the page shell to the active
  // palette. Flag OFF (default) → prop false → CasesClient renders the exact
  // legacy markup (byte-identical).
  const designSurfaces =
    Boolean((await getBrand().catch(() => null))?.features.designSurfaces);
  // Only pass the prop when on — keeps the RSC flight payload (and thus the
  // served HTML) byte-identical in the default flag-off state.
  return designSurfaces ? <CasesClient surfaces /> : <CasesClient />;
}
