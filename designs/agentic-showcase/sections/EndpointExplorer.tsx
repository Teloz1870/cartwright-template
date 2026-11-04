"use client";

import { useState } from "react";

type Endpoint = {
  label: string;
  path: string;
  description: string;
};

const ENDPOINTS: readonly Endpoint[] = [
  {
    label: "MCP server card",
    path: "/.well-known/mcp.json",
    description: "Machine-readable MCP identity, transport and public capability preview.",
  },
  {
    label: "OpenAPI 3.1",
    path: "/openapi.json",
    description: "Typed REST operations generated from the active tool registry.",
  },
  {
    label: "Agent guidance",
    path: "/llms.txt",
    description: "Human-readable guidance for safe public browsing and authenticated actions.",
  },
  {
    label: "API catalog",
    path: "/.well-known/api-catalog",
    description: "RFC 9727 discovery document linking the API description and documentation.",
  },
];

type Result = {
  status: number;
  statusText: string;
  contentType: string;
  cors: string;
  body: string;
};

function preview(text: string): string {
  if (text.length <= 3600) return text;
  return `${text.slice(0, 3600)}\n\n… response truncated in preview`;
}

export function EndpointExplorer({ enabled }: { enabled: boolean }) {
  const [selected, setSelected] = useState(ENDPOINTS[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function inspect() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(selected.path, {
        headers: { Accept: selected.path === "/llms.txt" ? "text/markdown" : "application/json" },
      });
      const body = await response.text();
      let formatted = body;
      if (response.headers.get("content-type")?.includes("json")) {
        try {
          formatted = JSON.stringify(JSON.parse(body), null, 2);
        } catch {
          formatted = body;
        }
      }
      setResult({
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type") ?? "unknown",
        cors: response.headers.get("access-control-allow-origin") ?? "not advertised",
        body: preview(formatted),
      });
    } catch {
      setError("The endpoint could not be reached from this browser session.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="agentic-explorer">
      <div className="agentic-explorer__bar">
        <span className="agentic-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <code>{selected.path}</code>
        <button type="button" onClick={inspect} disabled={!enabled || loading}>
          {loading ? "Inspecting…" : "Fetch live"}
        </button>
      </div>

      <div className="agentic-explorer__layout">
        <div className="agentic-explorer__menu" aria-label="Inspectable endpoints">
          {ENDPOINTS.map((endpoint) => (
            <button
              type="button"
              key={endpoint.path}
              aria-pressed={selected.path === endpoint.path}
              onClick={() => {
                setSelected(endpoint);
                setResult(null);
                setError(null);
              }}
            >
              <span>GET</span>
              {endpoint.label}
            </button>
          ))}
        </div>

        <div className="agentic-explorer__output" aria-live="polite">
          <div className="agentic-explorer__summary">
            <div>
              <strong>{selected.label}</strong>
              <p>{selected.description}</p>
            </div>
            {result && (
              <button type="button" onClick={copyResult}>{copied ? "Copied" : "Copy response"}</button>
            )}
          </div>

          {!enabled ? (
            <p className="agentic-explorer__empty">The public agent interface is disabled for this site.</p>
          ) : error ? (
            <p className="agentic-explorer__error" role="alert">{error}</p>
          ) : result ? (
            <>
              <dl className="agentic-response-meta">
                <div><dt>Status</dt><dd>{result.status} {result.statusText}</dd></div>
                <div><dt>Content-Type</dt><dd>{result.contentType}</dd></div>
                <div><dt>CORS</dt><dd>{result.cors}</dd></div>
              </dl>
              <pre tabIndex={0}><code>{result.body}</code></pre>
            </>
          ) : (
            <p className="agentic-explorer__empty">Choose an endpoint and fetch its real response from this running site.</p>
          )}
        </div>
      </div>
    </div>
  );
}
