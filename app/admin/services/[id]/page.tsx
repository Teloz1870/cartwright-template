import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ServiceForm from "@/components/admin/ServiceForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminServicePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  let service = null;
  if (id !== "new") {
    service = await prisma.service.findUnique({
      where: { id },
    });

    if (!service) {
      notFound();
    }
  }

  // Parse features JSON correctly
  let featuresArray: string[] = [];
  if (service?.features) {
    if (typeof service.features === "string") {
      try {
        featuresArray = JSON.parse(service.features);
      } catch {}
    } else if (Array.isArray(service.features)) {
      featuresArray = service.features as string[];
    }
  }

  const formattedService = service ? {
    id: service.id,
    slug: service.slug,
    title: service.title,
    shortDescription: service.shortDescription,
    priceString: service.priceString,
    heroImage: service.heroImage,
    features: featuresArray,
    body: service.body,
    showInNav: service.showInNav,
    navOrder: service.navOrder,
  } : undefined;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/services"
          className="p-2 rounded-full hover:bg-sol-ink/5 text-sol-muted hover:text-sol-ink transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-sol-ink">
            {id === "new" ? "Opret Ydelse" : "Rediger Ydelse"}
          </h1>
          <p className="text-sm font-semibold text-sol-muted mt-1">
            B2B services og ydelser (vises på /services).
          </p>
        </div>
      </div>

      <ServiceForm service={formattedService} />
    </div>
  );
}
