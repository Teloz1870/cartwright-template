"use client";

import { useState, type FormEvent } from "react";

/**
 * The letter section's signup form. Exists because the previous plain
 * `<form action method>` posted urlencoded data at /api/newsletter/subscribe —
 * a JSON-only endpoint — so a human submitting the homepage's most prominent
 * form landed on a raw 400 JSON page. Same visual markup, JSON fetch, inline
 * outcome in crema's own voice.
 *
 * Deliberately NOT WebMCP-annotated: the shared footer's `newsletter_signup`
 * form is the canonical agent path for this action, and tool names must stay
 * globally unique (the moat test reserves the name). One action, one tool.
 */
export default function CremaLetterForm({
  placeholder,
  cta,
  pendingText,
  successText,
  errorText,
}: {
  placeholder: string;
  cta: string;
  pendingText: string;
  successText: string;
  errorText: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setState("pending");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "crema-letter" }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean };
      setState(data.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p
        role="status"
        className="mx-auto mt-8 max-w-md font-[family-name:var(--font-crema-mono)] text-sm"
      >
        {successText}
      </p>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
      >
        <input
          name="email"
          type="email"
          required
          placeholder={placeholder}
          className="h-12 flex-1 rounded-full px-5 font-[family-name:var(--font-crema-mono)] text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "pending"}
          className="h-12 whitespace-nowrap rounded-full px-8 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-60"
        >
          {state === "pending" ? pendingText : cta}
        </button>
      </form>
      {state === "error" ? (
        <p
          role="status"
          className="mx-auto mt-3 max-w-md font-[family-name:var(--font-crema-mono)] text-xs opacity-80"
        >
          {errorText}
        </p>
      ) : null}
    </>
  );
}
