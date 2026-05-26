"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero-baggrundsvideo med poster-fallback, saveData-respekt og
 * video-crossfade.
 *
 * Performance-strategi:
 * - Poster.jpg er LCP-element (deterministisk + cacheable)
 * - Video crossfader ind ~400ms efter `canplay`-event
 * - Hvis bruger har 'Save Data' on → kun poster, ingen video-download
 *
 * Bevidst valg: respekterer IKKE `prefers-reduced-motion`. Vores hero-motion
 * er meget subtle (ambient hår-drift, ingen camera-pan/zoom), så ikke
 * vestibular-trigger material — bruger-feedback bekræftede at de FORVENTER
 * video selv med macOS Reduce Motion aktiv.
 *
 * Format-prioritet: browser vælger automatisk første understøttede source.
 * WebM (VP9) er typisk 30% mindre end MP4 — moderne browsere foretrækker det.
 * MP4 (H.264) er universel fallback til Safari + ældre browsere.
 */
export default function HeroVideo() {
  const [showFallback, setShowFallback] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Save-data → kun poster, ingen video-download (sparer bruger båndbredde)
    const saveData =
      typeof navigator !== "undefined" &&
      "connection" in navigator &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).connection?.saveData === true;

    if (saveData) {
      // Behold fallback (poster-img), video bliver aldrig renderet
      return;
    }

    const frame = requestAnimationFrame(() => setShowFallback(false));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Når video kan afspilles, crossfade fra poster til video
  function handleCanPlay() {
    setVideoReady(true);
  }

  if (showFallback) {
    // Save-data: kun statisk poster
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/hero/hero-poster-v4.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <>
      {/* Poster-image ligger under videoen og dækker indtil video er klar.
          Forbedrer LCP og forhindrer "tom firkant" mens video buffer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero/hero-poster-v4.jpg"
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
        poster="/hero/hero-poster-v4.jpg"
        aria-hidden="true"
        onCanPlay={handleCanPlay}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src="/hero/hero-v4.webm" type="video/webm" />
        <source src="/hero/hero-v4.mp4" type="video/mp4" />
      </video>
    </>
  );
}
