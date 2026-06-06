"use client";

import { useState, useTransition } from "react";
import {
  clearGoogleOAuthAction,
  disconnectGoogleOAuthAction,
  setGoogleOAuthAction,
} from "./actions";

type SingleKeyStatus = {
  isSet: boolean;
  preview: string | null;
  envFallback: boolean;
};

type Props = {
  initial: {
    clientId: SingleKeyStatus;
    clientSecret: SingleKeyStatus;
    allReady: boolean;
    connection: {
      configured: boolean;
      connected: boolean;
      status: string;
      accountEmail: string | null;
      grantedScopes: string[];
      tokenExpiresAt: string | null;
      connectedAt: string | null;
      lastError: string | null;
    };
  };
};

export default function GoogleOAuthForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientIdPreview, setClientIdPreview] = useState<string | null>(
    initial.clientId.preview,
  );
  const [clientSecretPreview, setClientSecretPreview] = useState<string | null>(
    initial.clientSecret.preview,
  );
  const [connected, setConnected] = useState(initial.connection.connected);
  const [lastError, setLastError] = useState(initial.connection.lastError);

  const hasCredentials =
    initial.allReady || !!(clientIdPreview && clientSecretPreview);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await setGoogleOAuthAction(formData);
      if (result.ok) {
        setClientIdPreview(result.clientIdPreview);
        setClientSecretPreview(result.clientSecretPreview);
        setClientId("");
        setClientSecret("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleClear() {
    if (!confirm("Fjern Google OAuth client ID og secret?")) return;
    startTransition(async () => {
      await clearGoogleOAuthAction();
      setClientIdPreview(null);
      setClientSecretPreview(null);
      setConnected(false);
    });
  }

  function handleDisconnect() {
    if (!confirm("Afbryd Google-forbindelsen og fjern gemte tokens?")) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectGoogleOAuthAction();
      if (result.ok) {
        setConnected(false);
        setLastError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {hasCredentials ? (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 text-sm font-bold text-green-900">
          Google OAuth client er sat — klar til at forbinde Workspace API.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>T0 connector:</strong> gem OAuth client ID + secret først.
          Derefter kan admin forbinde Google med offline access til server-side
          Sheets/Drive/Docs moduler.
        </div>
      )}

      <div className="rounded-xl border border-sol-ink/10 bg-sol-sand p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-sol-ink">OAuth client</h4>
            <p className="text-xs text-sol-muted">
              Server-side Google API client. Ikke kundelogin.
            </p>
          </div>
          {hasCredentials ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Sat
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              Mangler
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1">
          {clientIdPreview && (
            <code className="block rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
              Client ID: {clientIdPreview}
            </code>
          )}
          {clientSecretPreview && (
            <code className="block rounded bg-sol-cream px-2 py-1 font-mono text-xs text-sol-ink">
              Secret: {clientSecretPreview}
            </code>
          )}
          {initial.clientId.envFallback && (
            <p className="text-xs font-bold text-sol-muted">
              Client ID læses fra GOOGLE_OAUTH_CLIENT_ID.
            </p>
          )}
          {initial.clientSecret.envFallback && (
            <p className="text-xs font-bold text-sol-muted">
              Secret læses fra GOOGLE_OAUTH_CLIENT_SECRET.
            </p>
          )}
        </div>

        <form action={handleSubmit} className="mt-3 space-y-2">
          <input
            type="password"
            name="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="...apps.googleusercontent.com"
            className="block w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 font-mono text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <input
            type="password"
            name="clientSecret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Google OAuth client secret"
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
              disabled={
                pending ||
                clientId.trim().length === 0 ||
                clientSecret.trim().length === 0
              }
              className="rounded-full bg-sol-accent px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : hasCredentials ? "Replace" : "Save"}
            </button>
            {hasCredentials && (
              <button
                type="button"
                onClick={handleClear}
                disabled={pending}
                className="rounded-full border border-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
              >
                Fjern
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-sol-ink/10 bg-sol-sand p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-sol-ink">Google-forbindelse</h4>
            <p className="text-xs text-sol-muted">
              Gemmer refresh/access tokens krypteret i singleton-forbindelsen.
            </p>
          </div>
          {connected ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Sat
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              Mangler
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1 text-xs text-sol-muted">
          <p>Status: {connected ? "connected" : initial.connection.status}</p>
          {initial.connection.connectedAt && (
            <p>
              Connected:{" "}
              {new Date(initial.connection.connectedAt).toLocaleString("da-DK")}
            </p>
          )}
          {initial.connection.grantedScopes.length > 0 && (
            <p>{initial.connection.grantedScopes.length} scopes granted.</p>
          )}
          {lastError && (
            <p className="font-bold text-red-700">Seneste fejl: {lastError}</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- not a page: this API route 302-redirects to Google's OAuth consent, so we need a real full navigation, never next/link client-nav/prefetch */}
          <a
            href="/api/google/oauth/initiate"
            aria-disabled={!hasCredentials || pending}
            className={`rounded-full bg-sol-accent px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 ${
              !hasCredentials || pending ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Connect Google
          </a>
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={pending}
              className="rounded-full border border-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
            >
              Afbryd
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
