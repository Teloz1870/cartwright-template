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
        <StatusPill on={enabled} label={enabled ? "Til" : "Fra"} />
      </div>
      <p className="flex-1 text-sm text-sol-muted">{description}</p>
      {enabled ? (
        <Link
          href={href}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:bg-sol-accent-deep"
        >
          Åbn
        </Link>
      ) : (
        <Link
          href="/admin/features"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-sol-ink/15 bg-white px-4 py-2 text-sm font-black text-sol-ink transition hover:bg-sol-cream"
        >
          Slå <code className="rounded bg-sol-cream px-1 font-mono text-xs">{flagLabel}</code> til
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
        "Synkronisér produktkataloget med et Google Sheet via SKU som stabil nøgle (pull / push / sync).",
      href: "/admin/sheets",
      enabled: sheetsSync,
      flagLabel: "sheetsSync",
    },
    {
      title: "Google Drive",
      description:
        "Importér billeder fra Drive til mediebiblioteket, og send logiske backups til Drive.",
      href: "/admin/drive",
      enabled: googleDrive,
      flagLabel: "googleDrive",
    },
    {
      title: "Google Docs-import",
      description:
        "Importér et Google Doc som draft blogindlæg eller CMS-side — kun den strukturerede tekst.",
      href: "/admin/docs-import",
      enabled: docsImport,
      flagLabel: "docsImport",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-sol-muted">
        Connectorer der henter data ind fra eksterne tjenester. De deler Google
        Workspace OAuth2 (fanen “API keys”). Slå den enkelte connector til under{" "}
        <Link className="font-black underline" href="/admin/features">
          Funktioner
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
