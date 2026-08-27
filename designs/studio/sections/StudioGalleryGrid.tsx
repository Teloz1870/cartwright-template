/**
 * Studio gallery-grid — billedgalleri i 1–3 kolonner med valgfrie billedtekster.
 *
 * Magic Builder catalog-atom (følger StudioTestimonials/StudioLogoCloud guld-
 * standarden):
 *  - Client-safe: ren, SYNKRON, INGEN "use client", INGEN server-only deps,
 *    INGEN ReactNode-props (kun serialiserbare data — gemmes som JSON i
 *    Page.layoutJson). <img> bruges (ikke next/image).
 *  - Skema CO-LOCATED: atomet eksporterer selv sit Zod-schema + defaults, så
 *    section-registry læser fra ÉT sted.
 *  - Tokens: cw-stone-*, cw-terracotta, cw-paper (themes/studio.css) + dark:.
 *  - a11y: <figure>/<figcaption>; hvert <img> har alt (påkrævet) + loading="lazy".
 *  - Etset æstetik: rounded-xl, overflow-hidden, aspect-[4/3] cover, muteret tekst.
 *  - Dansk default-copy.
 */
import { z } from "zod";
import { StudioSection, StudioSectionHeader } from "./StudioSection";
import { cn } from "@/lib/utils";

export const galleryGridSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    items: z
      .array(
        z.object({
          src: z.string().min(1),
          alt: z.string().min(1),
          caption: z.string().optional(),
        }),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type StudioGalleryGridProps = z.infer<typeof galleryGridSchema>;

export const galleryGridDefaults: StudioGalleryGridProps = {
  eyebrow: "Galleri",
  title: "Et kig ind i værkstedet",
  items: [
    {
      src: "/images/studio/gallery-01.jpg",
      alt: "Håndlavet keramik tørrer på en trælist i værkstedet",
      caption: "Drejning på hjulet",
    },
    {
      src: "/images/studio/gallery-02.jpg",
      alt: "Glaserede skåle stillet op i rækker før brænding",
      caption: "Glasering før brænding",
    },
    {
      src: "/images/studio/gallery-03.jpg",
      alt: "Nærbillede af en kop med matglaseret overflade",
      caption: "Detalje i matglasur",
    },
    {
      src: "/images/studio/gallery-04.jpg",
      alt: "Den åbne ovn med færdigbrændte emner i varmt lys",
    },
  ],
};

export function StudioGalleryGrid({
  eyebrow,
  title,
  items,
}: StudioGalleryGridProps) {
  return (
    <StudioSection>
      {title ? (
        <StudioSectionHeader eyebrow={eyebrow} title={title} />
      ) : null}
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
          title ? "mt-12" : "",
        )}
      >
        {items.map((item, i) => (
          <figure
            key={i}
            className="overflow-hidden rounded-xl border border-cw-stone-200 dark:border-cw-stone-800 bg-cw-paper dark:bg-cw-stone-900/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- client-safe Studio catalog atom (Magic Builder); gallery item sized via aspect-ratio className, next/image intentionally not used here */}
            <img
              src={item.src}
              alt={item.alt}
              loading="lazy"
              className="aspect-[4/3] size-full object-cover"
            />
            {item.caption ? (
              <figcaption className="px-4 py-3 text-xs text-cw-stone-500 dark:text-cw-stone-400">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </StudioSection>
  );
}
