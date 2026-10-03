"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@/brand.config";

/**
 * Hero-baggrund med poster + optional video.
 *
 * **Brand-aware asset paths** (Phase F restoration, 2026-05-28):
 * - `brand.images.hero` → poster (kan være local path eller CDN-URL)
 * - `brand.images.heroVideoMp4` (optional) → mp4-source. Sættes, render
 *   <video> oven på posteren.
 * - `brand.images.heroVideoWebm` (optional) → webm-source. Browser foretrækker
 *   typisk denne over mp4 (30% mindre med VP9).
 *
 * Hvis ingen heroVideo* er sat, render kun posteren (statisk hero). Det er
 * den default fork-shops får — de kan opt'in to video ved at lægge en mp4
 * i public/hero/ og sætte brand.config.images.heroVideoMp4.
 *
 * **Save-data respekt:** hvis browser rapporterer `saveData`, skip video-
 * download helt — kun poster.
 *
 * **Prefers-reduced-motion:** historisk valgte vi at IKKE respektere det —
 * vores hero-motion er meget subtle (ambient drift, ingen camera-pan).
 * Customer-feedback bekræftede at users FORVENTER motion selv med Reduce
 * Motion aktiv. Det valg fastholdes.
 */
export default function HeroVideo() {
  const poster = brand.images.hero;
  // Optional video sources — typed loosely fordi brand.images er inline-typed
  // via `as const` og field er optional per brand. Fork-shops uden video
  // sætter dem ikke; ingen TS-fejl.
  const videoMp4 = (brand.images as Record<string, unknown>).heroVideoMp4 as
    | string
    | undefined;
  const videoWebm = (brand.images as Record<string, unknown>).heroVideoWebm as
    | string
    | undefined;
  const hasVideo = Boolean(videoMp4 || videoWebm);

  const [showFallback, setShowFallback] = useState(hasVideo); // start with poster only
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!hasVideo) return;

    // Save-data → kun poster, ingen video-download
    const saveData =
      typeof navigator !== "undefined" &&
      "connection" in navigator &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).connection?.saveData === true;

    if (saveData) return;

    const frame = requestAnimationFrame(() => setShowFallback(false));
    return () => cancelAnimationFrame(frame);
  }, [hasVideo]);

  function handleCanPlay() {
    setVideoReady(true);
  }

  // Ingen video konfigureret → kun statisk poster
  if (!hasVideo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  // Save-data fallback
  if (showFallback) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <>
      {/* Poster ligger under videoen og dækker indtil video er klar.
          Forbedrer LCP og forhindrer "tom firkant" mens video buffer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={poster}
        aria-hidden="true"
        onCanPlay={handleCanPlay}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
      >
        {videoWebm && <source src={videoWebm} type="video/webm" />}
        {videoMp4 && <source src={videoMp4} type="video/mp4" />}
      </video>
    </>
  );
}
