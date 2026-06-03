import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getBrand();
  return {
    title: `Ydelser & Services | ${brand.storeName}`,
    description: "Udforsk vores professionelle B2B services og ydelser.",
  };
}

/**
 * Services-siden lister Service-modellen fra DB (agency-offerings).
 * Skjult i ecommerce-mode shops fordi de ikke sælger services som
 * primær business — kun relevant for SaaS/agency-template forks.
 */
export default async function ServicesPage() {
  const isSaas =
    !brandConfig.ecommerceEnabled && brandConfig.industryTemplate === "saas";
  if (!isSaas) notFound();

  const services = await prisma.service.findMany({
    orderBy: { navOrder: "asc" },
  });

  return (
    <div className="bg-[#0A0A0A] text-white min-h-screen py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            Vores Ydelser
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Vi leverer top-professionelle B2B løsninger skræddersyet til din virksomheds behov. Vælg en ydelse for at læse mere.
          </p>
        </div>

        {services.length === 0 ? (
          <div className="text-center p-12 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-md">
            <p className="text-white/60">Der er ikke oprettet nogen ydelser endnu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => {
              // Parse features safely
              let features: string[] = [];
              if (typeof service.features === "string") {
                try { features = JSON.parse(service.features); } catch {}
              } else if (Array.isArray(service.features)) {
                features = service.features as string[];
              }

              return (
                <Link 
                  href={`/services/${service.slug}`} 
                  key={service.id}
                  className="group relative flex flex-col rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 overflow-hidden hover:bg-white/10 transition duration-500"
                >
                  {service.heroImage && (
                    <div className="h-48 w-full relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] to-transparent z-10" />
                      <Image 
                        src={service.heroImage} 
                        alt={service.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                  )}
                  
                  <div className={`p-8 flex-1 flex flex-col ${!service.heroImage && "pt-12"}`}>
                    <h2 className="text-2xl font-bold mb-3 group-hover:text-sol-accent transition">
                      {service.title}
                    </h2>
                    
                    {service.shortDescription && (
                      <p className="text-white/60 mb-6 text-sm leading-relaxed">
                        {service.shortDescription}
                      </p>
                    )}

                    {features.length > 0 && (
                      <ul className="space-y-3 mb-8 flex-1">
                        {features.slice(0, 3).map((feature, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                            <CheckCircle2 className="w-5 h-5 text-sol-accent shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                        {features.length > 3 && (
                          <li className="text-xs text-white/40 italic">
                            + {features.length - 3} flere fordele...
                          </li>
                        )}
                      </ul>
                    )}

                    <div className="mt-auto pt-6 border-t border-white/10 flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-white/90">
                        {service.priceString || "Pris på forespørgsel"}
                      </span>
                      <span className="text-sol-accent font-bold text-sm group-hover:translate-x-1 transition-transform">
                        Læs mere →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
