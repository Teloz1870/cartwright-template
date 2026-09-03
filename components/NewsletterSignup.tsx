"use client";

import { useTranslations } from "next-intl";

import { FormEvent, useState } from "react";
import { useFeature } from "@/lib/feature-flags/context";
import { WEBMCP_FORM_TOOL_NAMES } from "@/lib/model-context";

export default function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const t = useTranslations("Storefront");
  // WebMCP declarative form API (types/webmcp-dom.d.ts). NO autosubmit:
  // subscribing someone's email is communication the human should confirm.
  const webMcp = useFeature("webMcp");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  // `invalid` tracks FIELD-validity only (failed email format) so aria-invalid
  // never fires on a transport/server error where the typed value was fine.
  const [invalid, setInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const native = event.nativeEvent as SubmitEvent;
    const agentInvoked =
      native.agentInvoked === true && typeof native.respondWith === "function";

    // FormData-first (se SearchBox): agent-udfyldt DOM slår closure-state.
    const fromDom = new FormData(event.currentTarget).get("email");
    const submittedEmail = (typeof fromDom === "string" ? fromDom : email).trim();
    // Sync controlled state med den native værdi FØR pending-re-renderet —
    // ellers blanker feltet og et API-fejlslag efterlader brugeren uden sit
    // udkast (agent-udfyldt DOM, React-state stadig ""). Nulstil også et
    // tidligere success-flag: nativ udfyldning kører ikke onChange (som
    // ellers rydder det), og "Tak, du er tilmeldt" + en fejl må ikke stå
    // side om side efter et fejlslag på ADRESSE NUMMER TO.
    if (submittedEmail !== email) {
      setEmail(submittedEmail);
      setSuccess(false);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) {
      setSuccess(false);
      setInvalid(true);
      setError(t("newsletterInvalidEmail"));
      if (agentInvoked) native.respondWith!(Promise.resolve({ error: "Enter a valid email address." }));
      return;
    }

    // Selve arbejdet som ét promise, så en agent-invokeret submit kan få
    // UDFALDET via respondWith — mennesket ser præcis samme state-flow.
    const work = (async () => {
      setPending(true);
      setInvalid(false);
      setError("");
      try {
        const res = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: submittedEmail, source }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (data.ok) {
          setEmail("");
          setSuccess(true);
          return { status: "subscribed" };
        }
        // The human sees the server's (possibly localized) message; the agent
        // gets a stable English outcome it can act on.
        const message = data.error ?? t("newsletterGenericError");
        setError(message);
        return {
          error: data.error
            ? "That email address was rejected — check the format and try again."
            : "Subscription failed — the store had a temporary error.",
        };
      } catch {
        setError(t("newsletterGenericError"));
        return { error: "Subscription failed — the store had a temporary error." };
      } finally {
        setPending(false);
      }
    })();
    if (agentInvoked) native.respondWith!(work);
    await work;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2"
      {...(webMcp
        ? {
            toolname: WEBMCP_FORM_TOOL_NAMES.newsletterSignup,
            tooldescription:
              "Subscribe an email address to this store's newsletter. Asks the user to confirm before submitting.",
          }
        : {})}
    >
      <div className="flex gap-2">
        <input
          type="email"
          {...(webMcp ? { name: "email", toolparamdescription: "The email address to subscribe." } : {})}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
            setInvalid(false);
            setSuccess(false);
          }}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-white/30 focus:bg-white/15"
          aria-label={t("newsletterEmailAria")}
          aria-invalid={invalid ? true : false}
          aria-describedby="newsletter-status"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label={t("newsletterSubmitAria")}
          aria-busy={pending}
          className="shrink-0 rounded-md bg-white px-5 py-2 text-sm font-bold text-sol-accent transition hover:bg-sol-sun hover:text-sol-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {pending ? "…" : t("newsletterSubmit")}
        </button>
      </div>
      {error ? (
        <p id="newsletter-status" role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p id="newsletter-status" role="status" className="text-xs font-medium text-white/80">
          {t("newsletterSuccess")}
        </p>
      ) : null}
    </form>
  );
}
