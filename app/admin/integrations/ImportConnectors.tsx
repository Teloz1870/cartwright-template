import Link from "next/link";

/**
 * "Import & sync"-tab i Integrationer-hubben (Shopify "Apps"-mønster).
 *
 * v0.25.x: Google Sheets / Drive / Docs-import er ikke længere selvstændige
 * top-level nav-rækker — de samles her som connector-kort. Selve siderne
 * (/admin/sheets, /admin/drive, /admin/docs-import) består uændret og åbnes
 * herfra. Hvert kort er gated af sit eget runtime-flag; er flaget slået fra,
 * peger knappen mod /admin/features i stedet (docs-import 404'er ellers).
 */

type Connector = {
  title: string;
  description: string;
  href: string;
  enabled: boolean;
  flagLabel: string;
};

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        on ? "bg-emerald-100 text-emerald-900" : "bg-sol-ink/10 text-sol-muted"
      }`}
    >
      {label}
    </span>
  );
}

function ConnectorCard({ title, description, href, enabled, flagLabel }: Connector) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-black text-sol-ink">{title}</h3>
        <StatusPill on={enabled} label={enabled ? "On" : "Off"} />
      </div>
      <p className="flex-1 text-sm text-sol-muted">{description}</p>
      {enabled ? (
        <Link
          href={href}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep"
        >
          Open
        </Link>
      ) : (
        <Link
          href="/admin/features"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-sol-ink/15 bg-white px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream"
        >
          Enable <code className="rounded bg-sol-cream px-1 font-mono text-xs">{flagLabel}</code>
        </Link>
      )}
    </div>
  );
}

export default function ImportConnectors({
  sheetsSync,
  googleDrive,
  docsImport,
}: {
  sheetsSync: boolean;
  googleDrive: boolean;
  docsImport: boolean;
}) {
  const connectors: Connector[] = [
    {
      title: "Google Sheets",
      description:
        "Sync the product catalog with a Google Sheet using SKU as the stable key (pull / push / sync).",
      href: "/admin/sheets",
      enabled: sheetsSync,
      flagLabel: "sheetsSync",
    },
    {
      title: "Google Drive",
      description:
        "Import images from Drive into the media library, and send logical backups to Drive.",
      href: "/admin/drive",
      enabled: googleDrive,
      flagLabel: "googleDrive",
    },
    {
      title: "Google Docs import",
      description:
        "Import a Google Doc as a draft blog post or CMS page — only the structured text.",
      href: "/admin/docs-import",
      enabled: docsImport,
      flagLabel: "docsImport",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-sol-muted">
        Connectors that pull data in from external services. They share Google
        Workspace OAuth2 (the “API keys” tab). Enable an individual connector under{" "}
        <Link className="font-black underline" href="/admin/features">
          Features
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connectors.map((c) => (
          <ConnectorCard key={c.href} {...c} />
        ))}
      </div>
    </div>
  );
}
