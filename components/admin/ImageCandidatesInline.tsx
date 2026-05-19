"use client";

import Image from "next/image";

type Candidate = {
  id: string;
  thumbUrl: string;
  regularUrl: string;
  photographerName: string;
  photographerUrl: string;
};

type Props = {
  candidates: Candidate[];
  /** Kaldes når admin klikker på et billede. Modtager Unsplash photo-id +
   *  regular URL der skal gemmes på produktet. */
  onSelect: (candidate: Candidate) => void;
  disabled?: boolean;
};

/**
 * Grid 2x2 (eller 1x4 på smal width) af Unsplash-kandidater. Klik på et
 * billede → kalder onSelect som dispatcher products.attach_image via AI.
 */
export default function ImageCandidatesInline({
  candidates,
  onSelect,
  disabled,
}: Props) {
  if (candidates.length === 0) {
    return (
      <p className="text-xs italic text-sol-muted">
        Ingen billeder fundet. Prøv en bredere søgning (fx &quot;sunglasses&quot; alene).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-sol-muted">
        Vælg et billede til produktet
      </p>
      <div className="grid grid-cols-2 gap-2">
        {candidates.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            onClick={() => !disabled && onSelect(c)}
            disabled={disabled}
            aria-label={`Vælg billede ${idx + 1} af ${c.photographerName}`}
            className="group relative aspect-square overflow-hidden rounded-xl border-2 border-transparent bg-sol-cream transition hover:border-sol-accent disabled:opacity-50"
          >
            <Image
              src={c.thumbUrl}
              alt={`Foto af ${c.photographerName}`}
              fill
              sizes="(max-width: 640px) 50vw, 192px"
              className="object-cover transition group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
              <p className="text-[10px] font-bold text-white">
                Foto: {c.photographerName}
              </p>
            </div>
            <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-sol-ink">
              #{idx + 1}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-sol-muted">
        Foto via{" "}
        <a
          href="https://unsplash.com"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Unsplash
        </a>{" "}
        — credit til photographen gemmes med produktet.
      </p>
    </div>
  );
}
