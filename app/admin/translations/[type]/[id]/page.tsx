import { notFound } from "next/navigation";

import { getEntity } from "../../actions";
import { TranslationEditor } from "../../TranslationEditor";
import type { EntityType } from "@/lib/translations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string; id: string }> };

const TYPE_LABELS: Record<EntityType, string> = {
  product: "produkt",
  category: "kategori",
  page: "side",
  service: "service",
  post: "blogindlæg",
};

export default async function TranslationEditorPage({ params }: Props) {
  const { type, id } = await params;
  if (!(type in TYPE_LABELS)) notFound();
  const entity = await getEntity(type as EntityType, id);
  if (!entity) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black text-sol-ink">
        Oversæt {TYPE_LABELS[type as EntityType]}
      </h1>
      <TranslationEditor entity={entity} />
    </div>
  );
}
