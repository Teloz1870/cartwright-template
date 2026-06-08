"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DesignOption } from "@/designs/options";
import { setActiveDesignAction } from "./actions";

type Props = {
  designs: DesignOption[];
  activeSlug: string;
  /** True hvis activeSlug kom fra inferDesignFromIndustry (BrandingSettings.designSlug=null). */
  isInferred: boolean;
  cartwrightPlus: boolean;
  /** v0.9.4: slug → [accent, accentDeep, cream, sand, ink, muted] for swatches. */
  palettes?: Record<string, string[]>;
};

/**
 * Radio-grid af installed designs. "Auto"-option (=null i DB) er listet
 * først så ny-installer kan vælge den explicit. Klik → setActiveDesignAction
 * server-action → revalidate + visual confirmation.
 */
export default function DesignSelector({
  designs,
  activeSlug,
  isInferred,
  cartwrightPlus,
  palettes = {},
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedSlug, setSelectedSlug] = useState<string>(
    isInferred ? "" : activeSlug,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  function handleSelect(slug: string) {
    setSelectedSlug(slug);
    setError(null);
    setSavedSlug(null);
    startTransition(() => {
      void (async () => {
        const result = await setActiveDesignAction(slug);
        if (result.ok) {
          setSavedSlug(slug);
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {savedSlug !== null ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ Aktiv design opdateret.{" "}
          <a
            href="/"
            className="underline hover:no-underline"
            target="_blank"
            rel="noreferrer"
          >
            Åbn forsiden
          </a>{" "}
          for at se ændringen.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* "Auto"-option */}
        <DesignCard
          slug=""
          name="Auto (infer fra industry)"
          description="Lader Cartwright vælge default-design baseret på industryTemplate + ecommerceEnabled. Brug denne for at få v0.6.0-equivalent adfærd."
          mode="both"
          premium={false}
          isSelected={selectedSlug === ""}
          isActive={isInferred}
          pending={pending && selectedSlug === ""}
          cartwrightPlus={cartwrightPlus}
          onSelect={() => handleSelect("")}
        />
        {designs.map((d) => (
          <div key={d.slug} className="flex flex-col gap-1.5">
            <DesignCard
              slug={d.slug}
              name={d.name}
              description={d.description}
              mode={d.mode}
              premium={d.premium}
              isSelected={selectedSlug === d.slug}
              isActive={!isInferred && activeSlug === d.slug}
              pending={pending && selectedSlug === d.slug}
              cartwrightPlus={cartwrightPlus}
              palette={palettes[d.slug]}
              onSelect={() => handleSelect(d.slug)}
            />
            <a
              href={`/api/admin/designs/${d.slug}/export`}
              download
              className="self-start px-1 text-xs font-semibold text-sol-muted underline-offset-2 hover:text-sol-accent hover:underline dark:text-white/50"
              title="Download this design as a cartwright-design-v1 design.md (palette + identity; share or re-import)"
            >
              ⬇ Download design.md
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignCard({
  slug,
  name,
  description,
  mode,
  premium,
  isSelected,
  isActive,
  pending,
  cartwrightPlus,
  palette,
  onSelect,
}: {
  slug: string;
  name: string;
  description: string;
  mode: "website" | "webshop" | "both";
  premium: boolean;
  isSelected: boolean;
  isActive: boolean;
  pending: boolean;
  cartwrightPlus: boolean;
  palette?: string[];
  onSelect: () => void;
}) {
  const showProBadge = premium && !cartwrightPlus;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      className={`group relative flex flex-col items-start gap-2 rounded-2xl border-2 bg-white p-4 text-left transition-all dark:bg-sol-sand ${
        isActive
          ? "border-sol-accent shadow-sol-card"
          : isSelected
            ? "border-sol-accent/50"
            : "border-sol-ink/10 hover:border-sol-ink/30 dark:border-white/10 dark:hover:border-white/30"
      } ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-black text-sol-ink dark:text-white">
            {name}
          </h3>
          {showProBadge ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sol-sun/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-sol-ink dark:text-white">
              ⭐ Pro
            </span>
          ) : null}
        </div>
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sol-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
            ✓ Aktiv
          </span>
        ) : null}
      </div>
      <p className="text-sm font-medium leading-relaxed text-sol-muted dark:text-white/60">
        {description}
      </p>
      {palette && palette.length ? (
        <div className="flex gap-1" aria-hidden="true">
          {palette.map((hex, i) => (
            <span
              key={i}
              className="h-4 w-4 rounded-full border border-sol-ink/10 dark:border-white/15"
              style={{ backgroundColor: hex }}
              title={hex}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sol-muted/80 dark:text-white/40">
        <span>mode: {mode}</span>
        {slug ? (
          <code className="rounded bg-sol-ink/5 px-1.5 py-0.5 font-mono normal-case dark:bg-white/10">
            {slug}
          </code>
        ) : (
          <span className="italic normal-case">(infer)</span>
        )}
      </div>
    </button>
  );
}
