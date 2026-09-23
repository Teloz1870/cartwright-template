"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnounce } from "@/lib/a11y/announcement-context";

/**
 * Phase 10 Slice 7b — kunde write-review form.
 *
 * Bruges fra:
 *   - /[locale]/account/orders/[id]/anmeld   (logged-in, sender orderId)
 *   - /[locale]/review/[token]              (unauth, sender reviewToken)
 *   - PDP "Skriv en anmeldelse" (anonym, kun productId)
 *
 * Submit → POST /api/reviews → status="pending". Admin moderation gater synlighed.
 */

type Props = {
  productId: string;
  productName: string;
  orderId?: string;
  reviewToken?: string;
  defaultEmail?: string;
  defaultName?: string;
  locale?: "da" | "en";
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-transparent px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

type ReviewErrorKey =
  | "errInvalidFields"
  | "errOrderNotYours"
  | "errOrderNotFound"
  | "errProductNotFound"
  | "errEmailRequired"
  | "errGeneric";

/** Failure codes from the review endpoint → keys in this form's dictionary. */
const REVIEW_ERROR_KEY: Record<string, ReviewErrorKey> = {
  invalid_json: "errGeneric",
  invalid_fields: "errInvalidFields",
  order_not_yours: "errOrderNotYours",
  invalid_review_token: "errOrderNotYours",
  order_not_found: "errOrderNotFound",
  email_required: "errEmailRequired",
  product_not_found: "errProductNotFound",
};

export default function WriteReviewForm({
  productId,
  productName,
  orderId,
  reviewToken,
  defaultEmail = "",
  defaultName = "",
  locale = "da",
}: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const en = locale === "en";
  const t = {
    heading: en ? `Review ${productName}` : `Anmeld ${productName}`,
    rating: en ? "Your rating" : "Din vurdering",
    titleLabel: en ? "Title (optional)" : "Overskrift (valgfri)",
    titlePlaceholder: en ? "E.g. 'Fantastic quality'" : "Fx 'Fantastisk kvalitet'",
    reviewLabel: en ? "Your review" : "Din anmeldelse",
    reviewPlaceholder: en
      ? "How do you like the product? What should others know?"
      : "Hvordan oplever du produktet? Hvad bør andre vide?",
    nameLabel: en ? "Your name" : "Dit navn",
    emailLabel: en ? "Your email (not shown publicly)" : "Din email (vises ikke offentligt)",
    submit: en ? "Send review" : "Send anmeldelse",
    submitting: en ? "Sending…" : "Sender…",
    starsRequired: en ? "Please select a star rating." : "Vælg et antal stjerner.",
    bodyTooShort: en
      ? "The review must be at least 10 characters."
      : "Beskrivelsen skal være mindst 10 tegn.",
    thanksAnnounce: en
      ? "Thank you for your review — it will appear publicly once we've approved it."
      : "Tak for din anmeldelse — den vises offentligt så snart vi har godkendt den.",
    privacy: en
      ? "Your review is checked by our team before it appears publicly. We only use your email to contact you about the review — it is not shown."
      : "Din anmeldelse bliver gennemgået af vores team før den vises offentligt. Vi bruger din email kun til at kontakte dig om anmeldelsen — den vises ikke.",
    starAria: (n: number) => (en ? `${n} stars` : `${n} stjerner`),
    errPrefix: en ? "Error" : "Fejl",
    // Failure codes from the endpoint. It has no locale segment, so it answers
    // with a code; reading its `error` verbatim, as this form did, put the
    // server's language on the visitor's screen.
    errInvalidFields: en
      ? "Please check the fields and try again."
      : "Tjek felterne og prøv igen.",
    errOrderNotYours: en
      ? "That order belongs to a different account."
      : "Den ordre tilhører en anden konto.",
    errOrderNotFound: en ? "We could not find that order." : "Vi kunne ikke finde den ordre.",
    errProductNotFound: en ? "We could not find that product." : "Vi kunne ikke finde det produkt.",
    errEmailRequired: en
      ? "An email address is required for an anonymous review."
      : "Der skal en emailadresse til for en anonym anmeldelse.",
    errGeneric: en ? "Something went wrong. Please try again." : "Noget gik galt. Prøv igen.",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (rating < 1) {
      const msg = t.starsRequired;
      setFeedback(msg);
      announce(msg, "assertive");
      return;
    }
    if (body.trim().length < 10) {
      const msg = t.bodyTooShort;
      setFeedback(msg);
      announce(msg, "assertive");
      return;
    }

    startTransition(() => {
      void (async () => {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            orderId,
            reviewToken,
            rating,
            title: title.trim() || undefined,
            body: body.trim(),
            language: locale,
            authorName: name.trim() || undefined,
            authorEmail: email.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          const msg = `${t.errPrefix}: ${
            t[REVIEW_ERROR_KEY[data.code as string] ?? "errGeneric"]
          }`;
          setFeedback(msg);
          announce(msg, "assertive");
          return;
        }
        setSubmitted(true);
        announce(t.thanksAnnounce);
        router.refresh();
      })();
    });
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900">
        {en ? (
          <>
            Thank you for your review of <strong>{productName}</strong>! It will
            appear publicly once we&apos;ve approved it.
          </>
        ) : (
          <>
            Tak for din anmeldelse af <strong>{productName}</strong>! Den vises
            offentligt så snart vi har godkendt den.
          </>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-sol-ink/10 dark:border-white/10 bg-white p-5 dark:bg-sol-sand dark:text-white"
    >
      <h3 className="text-lg font-black text-sol-ink dark:text-white">
        {t.heading}
      </h3>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-black uppercase tracking-wide text-sol-muted">
          {t.rating}
        </span>
        <div className="flex gap-1 text-3xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={t.starAria(n)}
              className={`transition ${
                (hoverRating || rating) >= n
                  ? "text-amber-500"
                  : "text-sol-ink/20"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <Field label={t.titleLabel}>
        <input
          type="text"
          maxLength={120}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.titlePlaceholder}
        />
      </Field>

      <Field label={t.reviewLabel}>
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          className={`${inputClass} resize-none`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.reviewPlaceholder}
        />
        <span className="text-[10px] text-sol-muted">{body.length}/2000</span>
      </Field>

      {!orderId && !reviewToken && (
        <>
          <Field label={t.nameLabel}>
            <input
              type="text"
              required
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t.emailLabel}>
            <input
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </>
      )}

      {feedback && (
        <p className="text-xs font-black text-rose-700">{feedback}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? t.submitting : t.submit}
      </button>

      <p className="text-[10px] text-sol-muted">{t.privacy}</p>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-sol-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
