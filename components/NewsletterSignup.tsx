"use client";

import { FormEvent, useState } from "react";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSuccess(false);
      setError("Indtast en gyldig e-mailadresse");
      return;
    }

    // MOCK: no backend integration — this is a demo.
    setEmail("");
    setError("");
    setSuccess(true);
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
            setSuccess(false);
          }}
          placeholder="din@email.dk"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-white/30 focus:bg-white/15"
          aria-label="E-mailadresse"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-white px-5 py-2 text-sm font-bold text-sol-accent transition hover:bg-sol-sun hover:text-sol-ink"
        >
          Tilmeld
        </button>
      </div>
      {error ? <p className="text-xs text-red-200">{error}</p> : null}
      {success ? (
        <p className="text-xs font-medium text-white/80">Tak — du er tilmeldt!</p>
      ) : null}
    </form>
  );
}
