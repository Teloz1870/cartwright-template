"use client";

import { useState, useTransition } from "react";
import { setStripeKeyAction, clearStripeKeyAction } from "./actions";

type StripeKeyKind = "secret" | "publishable" | "webhook";

type SingleKeyStatus = { isSet: boolean; preview: string | null };

type Props = {
  initial: {
    secret: SingleKeyStatus;
    publishable: SingleKeyStatus;
    webhook: SingleKeyStatus;
    allReady: boolean;
  };
};

const FIELDS: Array<{
  kind: StripeKeyKind;
  label: string;
  placeholder: string;
  description: string;
}> = [
  {
    kind: "publishable",
    label: "Publishable Key",
    placeholder: "pk_test_...",
    description: "Eksponeres til frontend (Stripe Element). Sikker at vise i browser.",
  },
  {
    kind: "secret",
    label: "Secret Key",
    placeholder: "sk_test_...",
    description: "Server-side kun. Bruges til at oprette PaymentIntents.",
  },
  {
    kind: "webhook",
    label: "Webhook Secret",
    placeholder: "whsec_...",
    description: "Verificerer at webhook-events faktisk kommer fra Stripe.",
  },
];

export default function StripeKeyForm({ initial }: Props) {
  return (
    <div className="space-y-4">
      {/* Status banner: ready for Phase 3 when all 3 keys are set */}
      {initial.allReady ? (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 text-sm font-bold text-green-900">
          ✓ All 3 keys set — ready for Phase 3 (real payment integration)
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Phase 2 prep:</strong> keys are stored encrypted but are
          NOT used at runtime yet - mock payment continues until Phase 3.
          When all 3 are set, you are ready to take Stripe live.
        </div>
      )}

      {FIELDS.map((field) => (
        <StripeKeyRow
          key={field.kind}
          kind={field.kind}
          label={field.label}
          placeholder={field.placeholder}
          description={field.description}
          initial={initial[field.kind]}
        />
      ))}

      <p className="text-xs text-sol-muted">
        Get test keys at{" "}
        <a
          href="https://dashboard.stripe.com/test/apikeys"
          target="_blank"
          rel="noreferrer"
          className="font-bold text-sol-accent underline"
        >
          dashboard.stripe.com/test/apikeys
        </a>
        . Webhook-secret kommer fra et webhook-endpoint setup (se Phase 3-doc).
      </p>
    </div>
  );
}

function StripeKeyRow({
  kind,
  label,
  placeholder,
  description,
  initial,
}: {
  kind: StripeKeyKind;
  label: string;
  placeholder: string;
  description: string;
  initial: SingleKeyStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(initial.preview);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await setStripeKeyAction(kind, formData);
      if (r.ok) {
        setSavedPreview(r.preview);
        setInput("");
      } else {
        setError(r.error);
      }
    });
  }

  function handleClear() {
    if (!confirm(`Remove the Stripe ${label}? Real payment can't be enabled without it.`)) {
      return;
    }
    startTransition(async () => {
      await clearStripeKeyAction(kind);
      setSavedPreview(null);
    });
  }

  return (
    <div className="rounded-xl border border-sol-ink/10 bg-sol-sand p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-sol-ink">{label}</h4>
          <p className="text-xs text-sol-muted">{description}</p>
        </div>
        {savedPreview ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
            Set
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
            Missing
          </span>
        )}
      </div>

      {savedPreview && (
        <code className="mt-2 block rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
          {savedPreview}
        </code>
      )}

      <form action={handleSubmit} className="mt-3 space-y-2">
        <input
          type="password"
          name="apiKey"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          className="block w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
        />

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            className="rounded-full bg-sol-accent px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : savedPreview ? "Replace" : "Save"}
          </button>
          {savedPreview && (
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="rounded-full border border-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
