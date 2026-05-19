"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <div className="bg-sol-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-sol-ink font-black text-5xl sm:text-6xl leading-tight tracking-tight">
          Der opstod en uventet fejl
        </h1>
        <p className="text-sol-muted text-lg sm:text-xl font-medium mt-5">
          Noget gik galt, mens siden blev indlæst. Prøv igen, eller gå tilbage
          til forsiden.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-sol-accent px-6 py-3 text-sm font-bold tracking-wide text-sol-cream transition hover:brightness-95"
          >
            Prøv igen
          </button>
          <Button href="/" variant="dark">
            Til forsiden
          </Button>
        </div>
      </div>
    </div>
  );
}
