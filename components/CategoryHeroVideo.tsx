"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Video-URL (mp4 anbefales). Falder gracefully tilbage til posterImage. */
  videoUrl: string;
  /** Poster-billede (vises før video loader + ved saveData/reduced-motion). */
  posterImage: string;
  /** alt-text for poster (a11y — video selv er aria-hidden). */
  alt: string;
};

/**
 * Per-kategori hero-video. Adopteret fra components/HeroVideo.tsx-pattern,
 * generaliseret til URL-baseret (i stedet for hardcoded paths) så vi kan have
 * forskellig video pr kategori uden code-ændring.
 *
 * Performance-strategi:
 * - Poster (heroImage) er LCP-element — vises altid først
 * - Video crossfader ind når canplay event triggrer (~300-500ms typisk)
 * - saveData-detection → skip video, vis kun poster (mobil-data-respekt)
 * - prefers-reduced-motion → skip video (a11y for vestibular-sensitive)
 * - Lazy: video loader først 100ms efter mount (giver browser tid til at
 *   prioritere produkt-grid-rendering først)
 */
export default function CategoryHeroVideo({
  videoUrl,
  posterImage,
  alt,
}: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Save-data → kun poster, video bliver aldrig downloadet
    const saveData =
      typeof navigator !== "undefined" &&
      "connection" in navigator &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).connection?.saveData === true;

    if (saveData) return;

    // Reduced-motion-respekt: vestibular-følsomme brugere skipper video
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) return;

    // Lazy-load: vent 100ms så browser har tid til at rendere kritisk content
    // (produkt-grid, headers) før vi triggrer video-download
    const timer = setTimeout(() => setShowVideo(true), 100);
    return () => clearTimeout(timer);
  }, []);

  function handleCanPlay() {
    setVideoReady(true);
  }

  return (
    <>
      {/* Poster: altid renderet. LCP-element + fallback for saveData/reduced-motion. */}
      <Image
        src={posterImage}
        alt={alt}
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      {showVideo && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={posterImage}
          aria-hidden="true"
          onCanPlay={handleCanPlay}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      )}
    </>
  );
}
