import { Metadata } from "next";
import { brand } from "@/brand.config";
import LeadCaptureWizard from "@/components/website/LeadCaptureWizard";
import { notFound } from "next/navigation";

function requireSaasSurface() {
  if (brand.ecommerceEnabled || brand.industryTemplate !== "saas") notFound();
}

export async function generateMetadata(): Promise<Metadata> {
  requireSaasSurface();
  return {
    title: `Start Projekt | ${brand.storeName}`,
    description: "Start dit næste digitale projekt med os.",
  };
}

export default function StartProjectPage() {
  requireSaasSurface();
  return (
    <div className="min-h-[80vh] bg-[#050A19] pt-32 pb-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#d4af37]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-white/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <LeadCaptureWizard />
      </div>
    </div>
  );
}
