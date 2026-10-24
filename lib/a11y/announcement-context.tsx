"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Phase B1 — central announcement queue for screen-reader notifications.
 *
 * Cartwright's storefront mutates state via server actions (cart add/remove,
 * quantity change) and fetch (review submit). None of these produce native
 * focus changes a screen reader picks up automatically, so we need an
 * `aria-live` channel that announces the outcome.
 *
 * Two channels:
 *   - polite ("status")  → cart updates, review confirmations. Waits for
 *                          the user's current speech to finish.
 *   - assertive ("alert") → errors, urgent failures. Interrupts speech.
 *
 * Each announcement gets a monotonic id so the consumer (LiveRegion) can
 * key its DOM node by id — that forces React to remount the node when the
 * same message text fires twice in a row, which is what makes screen
 * readers re-announce it. Without that key, "Added to cart" → "Added to
 * cart" would be silent the second time.
 *
 * After CLEAR_DELAY_MS the announcement is wiped so a stale message
 * doesn't sit in the live region (some assistive tech re-announces on
 * region re-render).
 *
 * Used outside a provider: the hook returns a no-op, so server-rendered
 * islands or test harnesses don't blow up. The Provider is mounted once
 * in app/[locale]/layout.tsx.
 */

export type Politeness = "polite" | "assertive";

export type Announcement = {
  id: number;
  message: string;
  politeness: Politeness;
};

type AnnouncementContextValue = {
  /** Currently-rendered polite announcement, null between messages. */
  polite: Announcement | null;
  /** Currently-rendered assertive announcement, null between messages. */
  assertive: Announcement | null;
  /** Queue an announcement. Defaults to polite. Empty messages are ignored. */
  announce: (message: string, politeness?: Politeness) => void;
};

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

const CLEAR_DELAY_MS = 3000;

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState<Announcement | null>(null);
  const [assertive, setAssertive] = useState<Announcement | null>(null);
  const counter = useRef(0);
  const timers = useRef<{
    polite?: ReturnType<typeof setTimeout>;
    assertive?: ReturnType<typeof setTimeout>;
  }>({});

  const announce = useCallback(
    (message: string, politeness: Politeness = "polite") => {
      if (!message) return;
      counter.current += 1;
      const next: Announcement = { id: counter.current, message, politeness };

      if (politeness === "assertive") {
        if (timers.current.assertive) clearTimeout(timers.current.assertive);
        setAssertive(next);
        timers.current.assertive = setTimeout(
          () => setAssertive(null),
          CLEAR_DELAY_MS,
        );
      } else {
        if (timers.current.polite) clearTimeout(timers.current.polite);
        setPolite(next);
        timers.current.polite = setTimeout(
          () => setPolite(null),
          CLEAR_DELAY_MS,
        );
      }
    },
    [],
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.polite) clearTimeout(t.polite);
      if (t.assertive) clearTimeout(t.assertive);
    };
  }, []);

  return (
    <AnnouncementContext.Provider value={{ polite, assertive, announce }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

/**
 * Read the current announcements. Used by LiveRegion to render the DOM.
 * Returns nulls if no provider mounted.
 */
export function useAnnouncementState(): {
  polite: Announcement | null;
  assertive: Announcement | null;
} {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) return { polite: null, assertive: null };
  return { polite: ctx.polite, assertive: ctx.assertive };
}

/**
 * Imperative announce() function for client components (cart, reviews,
 * checkout errors). Defensive no-op outside a provider so isolated test
 * renders don't crash.
 */
export function useAnnounce(): AnnouncementContextValue["announce"] {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) return () => undefined;
  return ctx.announce;
}
