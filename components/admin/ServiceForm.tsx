"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createService, updateService, deleteService } from "@/app/admin/services/actions";
import { Trash2 } from "lucide-react";

type ServiceData = {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string | null;
  priceString?: string | null;
  heroImage?: string | null;
  features?: string[] | null;
  body: string;
  showInNav: boolean;
  navOrder: number;
};

export default function ServiceForm({ service }: { service?: ServiceData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [title, setTitle] = useState(service?.title || "");
  const [slug, setSlug] = useState(service?.slug || "");
  const [shortDescription, setShortDescription] = useState(service?.shortDescription || "");
  const [priceString, setPriceString] = useState(service?.priceString || "");
  const [heroImage, setHeroImage] = useState(service?.heroImage || "");
  const [body, setBody] = useState(service?.body || "## Beskrivelse\n\nBeskriv din ydelse her...");
  const [showInNav, setShowInNav] = useState(service?.showInNav ?? false);
  const [navOrder, setNavOrder] = useState(service?.navOrder || 0);
  
  // Features (JSON string array)
  const [features, setFeatures] = useState<string[]>(service?.features || ["", "", ""]);

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    setFeatures(newFeatures);
  };

  const addFeature = () => setFeatures([...features, ""]);
  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("slug", slug);
      formData.append("shortDescription", shortDescription);
      formData.append("priceString", priceString);
      formData.append("heroImage", heroImage);
      formData.append("body", body);
      if (showInNav) formData.append("showInNav", "on");
      formData.append("navOrder", String(navOrder));
      
      const cleanFeatures = features.filter(f => f.trim() !== "");
      formData.append("features", JSON.stringify(cleanFeatures));

      let res;
      if (service?.id) {
        res = await updateService(service.id, formData);
      } else {
        res = await createService(formData);
      }

      if (res?.ok === false) {
        setMessage({ type: "error", text: res.error || "Der opstod en fejl" });
      } else if (service?.id) {
        setMessage({ type: "success", text: "Ydelsen er opdateret!" });
      }
    });
  };

  const handleDelete = () => {
    if (!service?.id) return;
    if (confirm("Er du sikker på at du vil slette denne ydelse?")) {
      startTransition(async () => {
        const res = await deleteService(service.id);
        if (res.ok) {
          router.push("/admin/services");
        } else {
          setMessage({ type: "error", text: res.error || "Der opstod en fejl" });
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-sol-sand p-6 rounded-xl border border-sol-ink/10 space-y-6">
      {message && (
        <div className={`p-4 rounded-lg font-bold text-sm ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-bold text-sol-ink mb-1">Titel</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white"
            placeholder="fx Domæneflytning"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-sol-ink mb-1">Slug</label>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white"
            placeholder="fx domain-migration"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-bold text-sol-ink mb-1">Kort Beskrivelse</label>
          <input
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white"
            placeholder="Vises på forsiden af service kataloget"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-sol-ink mb-1">Pris streng</label>
          <input
            value={priceString}
            onChange={(e) => setPriceString(e.target.value)}
            className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white"
            placeholder="fx Fra 9€ / md"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-sol-ink mb-1">Hero Image URL</label>
        <input
          value={heroImage}
          onChange={(e) => setHeroImage(e.target.value)}
          className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-sol-ink mb-1">Bullet Features</label>
        <p className="text-xs text-sol-muted mb-2">Fremhævede features til B2B priskortet.</p>
        <div className="space-y-2">
          {features.map((feature, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={feature}
                onChange={(e) => handleFeatureChange(i, e.target.value)}
                className="flex-1 rounded-md border border-sol-ink/20 px-3 py-2 bg-white text-sm"
                placeholder={`Feature ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeFeature(i)}
                className="px-3 text-red-500 hover:bg-red-50 rounded-md transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFeature}
            className="text-xs font-bold text-sol-accent hover:underline mt-2"
          >
            + Tilføj Feature
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-sol-ink mb-1">Salgstekst / Body</label>
        <textarea
          required
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-md border border-sol-ink/20 px-3 py-2 bg-white font-mono text-sm"
          placeholder="Markdown understøttes..."
        />
      </div>

      <div className="flex items-center gap-6 p-4 bg-sol-cream/50 rounded-lg border border-sol-ink/5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInNav}
            onChange={(e) => setShowInNav(e.target.checked)}
            className="h-4 w-4 accent-sol-accent"
          />
          <span className="text-sm font-bold text-sol-ink">Vis i Hovedmenu</span>
        </label>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-sol-ink">Menu Rækkefølge:</label>
          <input
            type="number"
            value={navOrder}
            onChange={(e) => setNavOrder(parseInt(e.target.value) || 0)}
            className="w-20 rounded-md border border-sol-ink/20 px-2 py-1 bg-white"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-sol-ink/10 flex items-center justify-between">
        {service?.id ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm font-bold text-red-500 hover:text-red-600 transition"
          >
            Slet Ydelse
          </button>
        ) : <div />}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-sol-accent px-8 py-2.5 text-sm font-bold text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
        >
          {isPending ? "Gemmer..." : "Gem Ydelse"}
        </button>
      </div>
    </form>
  );
}
