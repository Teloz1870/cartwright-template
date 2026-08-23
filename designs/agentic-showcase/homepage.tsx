import Link from "next/link";
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";
import { EndpointExplorer } from "./sections/EndpointExplorer";
import { InstallCommand } from "./sections/InstallCommand";
import "./showcase.css";

const copy = {
  en: {
    eyebrow: "Cartwright · agent-ready profile",
    headline: "A site agents can understand before they ever click.",
    intro: "Cartwright ships semantic server-rendered pages for people and typed, governed interfaces for software agents. Public browsing is anonymous and read-only. Private data and every action stay behind scoped API keys.",
    primary: "Inspect live contracts",
    secondary: "Read developer docs",
    proofTitle: "Proof before promises",
    proofBody: "The running site exposes evidence you can inspect directly. An external score is only published after the independent report has refreshed.",
    pending: "Independent score verification pending",
    architecture: "One content system. Two first-class readers.",
    architectureBody: "Humans get a fast, accessible interface. Agents get the same public facts through explicit contracts instead of scraping brittle UI state.",
    contracts: "Live, bounded contracts",
    contractsBody: "Every interface states what is public, what needs authority and how a client recovers from errors.",
    inspector: "Inspect the running site",
    inspectorBody: "These responses are fetched from this deployment—not copied into a marketing mockup.",
    security: "Useful without becoming unsafe",
    securityBody: "Cartwright separates discovery from authority. Agents can research public information immediately, while customer data, orders, checkout state, administration and writes require explicit scopes.",
    cta: "Start with the same foundation",
    ctaBody: "Scaffold a real site or shop with SSR, structured data, developer discovery and a governed agent surface already wired together.",
  },
  da: {
    eyebrow: "Cartwright · agentklar profil",
    headline: "Et site agenter kan forstå, før de klikker.",
    intro: "Cartwright leverer semantiske, server-renderede sider til mennesker og typed, styrede interfaces til softwareagenter. Offentlig browsing er anonym og read-only. Private data og alle handlinger forbliver bag scoped API-nøgler.",
    primary: "Inspicér live-kontrakter",
    secondary: "Læs udviklerdocs",
    proofTitle: "Beviser før løfter",
    proofBody: "Det kørende site eksponerer dokumentation, du kan kontrollere direkte. En ekstern score offentliggøres først, når den uafhængige rapport er opdateret.",
    pending: "Uafhængig scoreverifikation afventer",
    architecture: "Ét indholdssystem. To førsteklasses læsere.",
    architectureBody: "Mennesker får en hurtig og tilgængelig brugerflade. Agenter får de samme offentlige fakta gennem eksplicitte kontrakter i stedet for at scrape skrøbelig UI-state.",
    contracts: "Live, afgrænsede kontrakter",
    contractsBody: "Hvert interface fortæller, hvad der er offentligt, hvad der kræver autoritet, og hvordan en klient kommer videre efter fejl.",
    inspector: "Inspicér det kørende site",
    inspectorBody: "Svarene hentes fra denne deployment – de er ikke kopieret ind i en marketing-mockup.",
    security: "Nyttigt uden at blive usikkert",
    securityBody: "Cartwright adskiller discovery fra autoritet. Agenter kan undersøge offentlig information med det samme, mens kundedata, ordrer, checkout-state, administration og writes kræver eksplicitte scopes.",
    cta: "Start med det samme fundament",
    ctaBody: "Scaffold et rigtigt site eller en shop med SSR, structured data, developer discovery og en styret agentoverflade, der allerede hænger sammen.",
  },
} as const;

const contracts = [
  { name: "MCP", path: "/api/mcp", access: "5 anonymous read tools · Bearer for more", detail: "Streamable HTTP, handshake, tools and public resources" },
  { name: "OpenAPI 3.1", path: "/openapi.json", access: "Per-operation security", detail: "Typed inputs, outputs, errors and unique operation IDs" },
  { name: "REST tools", path: "/api/v1/tools", access: "Anonymous allowlist · scoped Bearer", detail: "One predictable path per registered operation" },
  { name: "Agent guidance", path: "/llms.txt", access: "Public", detail: "When-to-use, safety boundaries and live capabilities" },
  { name: "Recovery", path: "/this-does-not-exist", access: "Public", detail: "Real 404 with markdown-aware recovery links" },
] as const;

const foundations = [
  { key: "01", title: "Server-rendered meaning", body: "Semantic headings, trust pages, canonical URLs and structured data exist in raw HTML without waiting for hydration." },
  { key: "02", title: "Protocol-native discovery", body: "MCP cards, RFC 9727 API catalog, OpenAPI and portable Agent Skills expose predictable entry points." },
  { key: "03", title: "Least-privilege authority", body: "Anonymous access is limited to published public content. Keys unlock only the scopes their owner granted." },
  { key: "04", title: "Recoverable failure", body: "Problem Details, rate-limit metadata and agent-friendly 404s tell software clients exactly what happened and what to do next." },
] as const;

function hostname(): string {
  try {
    return new URL(brand.url).hostname;
  } catch {
    return "your-domain.com";
  }
}

export default function AgenticShowcaseHomepage({ settings, locale }: DesignHomepageProps) {
  const t = locale === "da" ? copy.da : copy.en;
  const home = `/${locale}`;
  const agentInterfaceEnabled = Boolean(brand.features.mcpPublic);
  const siteName = settings?.storeName || brand.storeName;
  const auditTarget = `${hostname()}/${locale}`;
  const publicReport = `https://is-agentic.com/scan/${hostname()}/${locale}`;

  return (
    <div className="agentic-home">
      <section className="agentic-hero">
        <div className="agentic-grid" aria-hidden="true" />
        <div className="agentic-container agentic-hero__content">
          <p className="agentic-eyebrow"><i aria-hidden="true" /> {t.eyebrow}</p>
          <h1>{t.headline}</h1>
          <p className="agentic-hero__intro">{t.intro}</p>
          <InstallCommand command="npx create-cartwright@latest my-site" />
          <div className="agentic-hero__actions">
            <a href="#inspector" className="agentic-button">{t.primary}</a>
            <Link href={`${home}/developers`} className="agentic-button agentic-button--ghost">{t.secondary}</Link>
          </div>
          <ul className="agentic-signal-row" aria-label="Built-in agent foundations">
            <li><span>SSR</span> raw HTML</li>
            <li><span>MCP</span> Streamable HTTP</li>
            <li><span>3.1</span> OpenAPI</li>
            <li><span>RFC</span> Problem Details</li>
          </ul>
        </div>
      </section>

      <section className="agentic-proof agentic-container" id="scorecard">
        <div>
          <p className="agentic-kicker">External verification</p>
          <h2>{t.proofTitle}</h2>
          <p>{t.proofBody}</p>
        </div>
        <div className="agentic-proof__status">
          <span className="agentic-status agentic-status--pending"><i aria-hidden="true" /> {t.pending}</span>
          <code>npx is-agentic {auditTarget}</code>
          <a href={publicReport}>Open public scorecard ↗</a>
        </div>
      </section>

      <section className="agentic-section agentic-deferred" id="architecture">
        <div className="agentic-container">
          <p className="agentic-kicker">Architecture</p>
          <div className="agentic-section__heading">
            <h2>{t.architecture}</h2>
            <p>{t.architectureBody}</p>
          </div>
          <div className="agentic-foundations">
            {foundations.map((item) => (
              <article key={item.key}>
                <span>{item.key}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="agentic-section agentic-section--contrast agentic-deferred" id="contracts">
        <div className="agentic-container">
          <p className="agentic-kicker">Machine surface</p>
          <div className="agentic-section__heading">
            <h2>{t.contracts}</h2>
            <p>{t.contractsBody}</p>
          </div>
          <div className="agentic-contract-table" role="region" aria-label="Agent interface contracts" tabIndex={0}>
            <table>
              <thead><tr><th>Interface</th><th>Endpoint</th><th>Authority</th><th>Contract</th></tr></thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.name}>
                    <th scope="row">{contract.name}</th>
                    <td><a href={contract.path}><code>{contract.path}</code></a></td>
                    <td>{contract.access}</td>
                    <td>{contract.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="agentic-section" id="inspector">
        <div className="agentic-container">
          <p className="agentic-kicker">Live inspector</p>
          <div className="agentic-section__heading">
            <h2>{t.inspector}</h2>
            <p>{t.inspectorBody}</p>
          </div>
          <EndpointExplorer enabled={agentInterfaceEnabled} />
        </div>
      </section>

      <section className="agentic-security agentic-deferred">
        <div className="agentic-container agentic-security__grid">
          <div>
            <p className="agentic-kicker">Security model</p>
            <h2>{t.security}</h2>
            <p>{t.securityBody}</p>
          </div>
          <dl>
            <div><dt>Anonymous</dt><dd>Published products, categories and public pages only</dd></div>
            <div><dt>Scoped key</dt><dd>Exactly the reads and actions granted by the owner</dd></div>
            <div><dt>Never anonymous</dt><dd>Customers, orders, checkout state, administration and writes</dd></div>
            <div><dt>Abuse control</dt><dd>Shared per-IP budget with standard rate-limit metadata</dd></div>
          </dl>
        </div>
      </section>

      <section className="agentic-cta">
        <div className="agentic-container">
          <p className="agentic-kicker">Out of the box</p>
          <h2>{t.cta}</h2>
          <p>{t.ctaBody}</p>
          <InstallCommand command="npx create-cartwright@latest my-site" />
          <div className="agentic-hero__actions">
            <a href="https://cartwright.app" className="agentic-button">Explore Cartwright</a>
            <a href="https://github.com/Teloz1870/cartwright-template" className="agentic-button agentic-button--ghost">View source</a>
          </div>
          <p className="agentic-cta__note">{siteName} · Verify every claim against the running endpoints and current public report.</p>
        </div>
      </section>
    </div>
  );
}
