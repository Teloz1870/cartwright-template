"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Stagger-delay i ms — bruges på sibling-cards så de fade'er ind sekventielt. */
  delay?: number;
  /** Custom className for wrapper. Default: block. */
  className?: string;
};

/**
 * Phase 8 Task A — IntersectionObserver-baseret scroll-reveal wrapper.
 *
 * Pre-reveal: opacity-0 + translate-y-3 (subtle, ikke distraktiv)
 * Post-reveal: opacity-100 + translate-y-0 over 400ms ease-out
 *
 * Respekterer prefers-reduced-motion via CSS media query (start-state
 * defaulter til revealed for at undgå "snap-into-place" når motion er off).
 *
 * Phase 8 Gemini-review (low-med): brug shared observer + will-change for
 * GPU-acceleration. Reducerer fra N observers til 1 per page, bedre på
 * mange-card sider (/produkter med 25+ items).
 *
 * Threshold 0.1 (10% af kortet synligt) — triggrer tidligt nok til at
 * animationen er færdig før kortet er helt i view, men ikke så tidligt at
 * den fyrer på off-screen content. rootMargin: 0px 0px 50px 0px så cards
 * der scrolles forbi hurtigt stadig får tid til at observe.
 */

// Lazy-init shared observer pr page-load. Map element → callback så
// observer ved hvilken setRevealed at kalde uden at hver wrapper skal
// vedligeholde sin egen observer-instans.
let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function getSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const cb = callbacks.get(entry.target);
          if (cb) {
            cb();
            sharedObserver?.unobserve(entry.target);
            callbacks.delete(entry.target);
          }
        }
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px 50px 0px" },
  );
  return sharedObserver;
}

export default function RevealOnScroll({ children, delay = 0, className = "" }: Props) {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced-motion: spring straight til revealed-state, ingen observer
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const observer = getSharedObserver();
    callbacks.set(el, () => setRevealed(true));
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      callbacks.delete(el);
    };
  }, []);

  // will-change: GPU-hint mens vi venter på reveal. Fjernes efter reveal
  // så browseren kan frigøre layer-compositing-buffer.
  const base = `transition-[opacity,transform] duration-[400ms] ease-out ${className}`.trim();
  const style = revealed
    ? { opacity: 1, transform: "translateY(0)", transitionDelay: `${delay}ms`, willChange: "auto" as const }
    : { opacity: 0, transform: "translateY(12px)", willChange: "opacity, transform" };

  return (
    <div ref={ref} className={base} style={style}>
      {children}
    </div>
  );
}
