import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
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
export default function CasesPage() {
  const isSaas =
    !brand.ecommerceEnabled && brand.industryTemplate === "saas";
  if (!isSaas) notFound();
  return <CasesClient />;
}
