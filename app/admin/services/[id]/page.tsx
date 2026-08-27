import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import ServiceForm from "@/components/admin/ServiceForm";
import { AdminPageHeader } from "@/components/admin/ui";

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
      <AdminPageHeader
        title={id === "new" ? "Create Service" : "Edit Service"}
        subtitle="B2B services (shown on /services)."
        breadcrumb={[{ label: "Services", href: "/admin/services" }]}
      />

      <ServiceForm service={formattedService} />
    </div>
  );
}
