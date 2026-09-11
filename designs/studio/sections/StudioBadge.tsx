/**
 * Studio pill-badge — 3 tones (default / terracotta / oker). Port af
 * cartwright-app/apps/web/components/ui/badge.tsx.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "terracotta" | "oker";

const tones: Record<Tone, string> = {
  default:
    "border-cw-stone-200 dark:border-cw-stone-800 bg-cw-stone-100 dark:bg-cw-stone-800 text-cw-stone-700 dark:text-cw-stone-300",
  terracotta:
    "border-cw-terracotta/30 bg-cw-terracotta/10 text-cw-terracotta",
  oker:
    "border-cw-oker/30 bg-cw-oker/10 text-cw-oker-strong dark:text-cw-oker",
};

export function StudioBadge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
