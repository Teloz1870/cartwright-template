"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Magic-link login form. Bruger Auth.js v5 EmailProvider — kunden indtaster
 * sin email og får et engangs-link i mailen. Klik = logget ind, ingen
 * password krævet. PreviewMailer skriver mailen til .mail-previews/ i dev.
 */
export default function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("sending");
    setErrorMessage(null);

    try {
      const result = await signIn("email", {
        email: email.trim(),
        redirect: false,
      });

      if (result?.error) {
        setStatus("error");
        setErrorMessage(
          result.error.toLowerCase().includes("rate") ||
            result.error.toLowerCase().includes("mange")
            ? "For mange anmodninger. Vent et øjeblik."
            : "Noget gik galt. Prøv igen om lidt.",
        );
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMessage("Noget gik galt. Prøv igen om lidt.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-black">✓ Tjek din indbakke</p>
        <p className="mt-1 leading-6">
          Vi har sendt et magic-link til <strong>{email}</strong>. Klik på
          linket for at logge ind. Linket udløber om 15 minutter.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-xs text-sol-muted">
            💡 Dev: mail skrevet til <code>.mail-previews/auth-link-*.html</code>
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
            setErrorMessage(null);
          }}
          className="mt-3 text-xs font-black uppercase tracking-widest text-sol-accent hover:underline"
        >
          Send til en anden email
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-full border border-sol-ink/20 bg-white px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";

  const labelClass = "block text-sm font-bold text-sol-ink mb-1";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errorMessage && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="magic-link-email" className={labelClass}>
          E-mail
        </label>
        <input
          id="magic-link-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="din@email.dk"
          className={inputClass}
        />
      </div>

      <p className="text-xs leading-6 text-sol-muted">
        Vi sender dig et engangs-link i mailen — ingen adgangskode nødvendig.
        Klik på linket, og du er logget ind.
      </p>

      <button
        type="submit"
        disabled={status === "sending" || !email.trim()}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "sending" ? "Sender…" : "Send mig et link"}
      </button>
    </form>
  );
}
