"use client";

/**
 * Root-layout error boundary. Fanger fejl der opstår i selve root layout
 * (hvor app/error.tsx ikke kan render'e fordi layout selv er knækket).
 *
 * Skal selv levere <html>+<body> — der er ingen layout omkring den.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f5f1ea",
          color: "#1a1a1a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 900,
              margin: "0 0 1rem",
              letterSpacing: "-0.02em",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ fontSize: "1.125rem", margin: "0 0 2rem", opacity: 0.7 }}>
            We have received an error report. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              borderRadius: "9999px",
              border: "none",
              background: "#1a1a1a",
              color: "#f5f1ea",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
