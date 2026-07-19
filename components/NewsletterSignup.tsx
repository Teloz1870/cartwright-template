"use client";

import { FormEvent, useState } from "react";

export default function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  // `invalid` tracks FIELD-validity only (failed email format) so aria-invalid
  // never fires on a transport/server error where the typed value was fine.
  const [invalid, setInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSuccess(false);
      setInvalid(true);
      setError("Enter a valid email address");
      return;
    }

    setPending(true);
    setInvalid(false);
    setError("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setEmail("");
        setSuccess(true);
      } else {
        setError(data.error ?? "Noget gik galt. Prøv igen.");
      }
    } catch {
      setError("Noget gik galt. Prøv igen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
            setInvalid(false);
            setSuccess(false);
          }}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-white/30 focus:bg-white/15"
          aria-label="Email address"
          aria-invalid={invalid ? true : false}
          aria-describedby="newsletter-status"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Sign up for the newsletter"
          aria-busy={pending}
          className="shrink-0 rounded-md bg-white px-5 py-2 text-sm font-bold text-sol-accent transition hover:bg-sol-sun hover:text-sol-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {pending ? "…" : "Sign up"}
        </button>
      </div>
      {error ? (
        <p id="newsletter-status" role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p id="newsletter-status" role="status" className="text-xs font-medium text-white/80">
          Thanks, you are subscribed.
        </p>
      ) : null}
    </form>
  );
}
