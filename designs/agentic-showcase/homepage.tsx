import Link from "next/link";
import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";
import type { DesignHomepageProps } from "../types";
import { EndpointExplorer } from "./sections/EndpointExplorer";
import { InstallCommand } from "./sections/InstallCommand";
import "./showcase.css";

const copy = {
  en: {
    eyebrow: "Cartwright · agent-ready profile",
    headline: "A site agents can understand before they ever click.",
    intro: "Cartwright ships semantic server-rendered pages for people and typed, governed interfaces for software agents. Public browsing is anonymous and read-only. Private data and every action stay behind scoped API keys.",
    introDisabled: "Cartwright ships semantic server-rendered pages for people and software agents. This lean profile exposes only the public web layer and does not advertise an agent API or administrative action surface.",
    primary: "Inspect live contracts",
    primaryDisabled: "Inspect the foundations",
    secondary: "Read developer docs",
    secondaryDisabled: "Read about this site",
    proofTitle: "Proof before promises",
    proofBody: "The running site exposes evidence you can inspect directly. An external score is only published after the independent report has refreshed.",
    proofBodyDisabled: "This deployment exposes verifiable web foundations without pretending that optional programmatic interfaces are installed.",
    pending: "Independent score verification pending",
    disabled: "Agent interfaces are disabled in this profile",
    architecture: "One content system. Two first-class readers.",
    architectureBody: "Humans get a fast, accessible interface. Agents get the same public facts through explicit contracts instead of scraping brittle UI state.",
    architectureBodyDisabled: "Humans and agents receive the same semantic, server-rendered public pages. Optional programmatic interfaces are omitted rather than advertised as placeholders.",
    contracts: "Live, bounded contracts",
    contractsBody: "Every interface states what is public, what needs authority and how a client recovers from errors.",
    inspector: "Inspect the running site",
    inspectorBody: "These responses are fetched from this deployment—not copied into a marketing mockup.",
    security: "Useful without becoming unsafe",
    securityBody: "Cartwright separates discovery from authority. Agents can research public information immediately, while customer data, orders, checkout state, administration and writes require explicit scopes.",
    securityBodyDisabled: "This profile exposes public web content only. It includes no customer, order, checkout, administration or programmatic write surface.",
    cta: "Start with the same foundation",
    ctaBody: "Scaffold a real site or shop with SSR, structured data, developer discovery and a governed agent surface already wired together.",
    ctaBodyDisabled: "Scaffold a lean public site with SSR, structured data, trust pages and predictable recovery, then add governed agent interfaces only when the project needs them.",
  },
  da: {
    eyebrow: "Cartwright · agentklar profil",
    headline: "Et site agenter kan forstå, før de klikker.",
    intro: "Cartwright leverer semantiske, server-renderede sider til mennesker og typed, styrede interfaces til softwareagenter. Offentlig browsing er anonym og read-only. Private data og alle handlinger forbliver bag scoped API-nøgler.",
    introDisabled: "Cartwright leverer semantiske, server-renderede sider til mennesker og softwareagenter. Denne lette profil eksponerer kun det offentlige web-lag og annoncerer ingen agent-API eller administrativ handlingsflade.",
    primary: "Inspicér live-kontrakter",
    primaryDisabled: "Inspicér fundamentet",
    secondary: "Læs udviklerdocs",
    secondaryDisabled: "Læs om sitet",
    proofTitle: "Beviser før løfter",
    proofBody: "Det kørende site eksponerer dokumentation, du kan kontrollere direkte. En ekstern score offentliggøres først, når den uafhængige rapport er opdateret.",
    proofBodyDisabled: "Denne deployment eksponerer verificerbare webfundamenter uden at foregive, at valgfrie programmatiske interfaces er installeret.",
    pending: "Uafhængig scoreverifikation afventer",
    disabled: "Agentinterfaces er deaktiveret i denne profil",
    architecture: "Ét indholdssystem. To førsteklasses læsere.",
    architectureBody: "Mennesker får en hurtig og tilgængelig brugerflade. Agenter får de samme offentlige fakta gennem eksplicitte kontrakter i stedet for at scrape skrøbelig UI-state.",
    architectureBodyDisabled: "Mennesker og agenter modtager de samme semantiske, server-renderede offentlige sider. Valgfrie programmatiske interfaces udelades i stedet for at blive annonceret som placeholders.",
    contracts: "Live, afgrænsede kontrakter",
    contractsBody: "Hvert interface fortæller, hvad der er offentligt, hvad der kræver autoritet, og hvordan en klient kommer videre efter fejl.",
    inspector: "Inspicér det kørende site",
    inspectorBody: "Svarene hentes fra denne deployment – de er ikke kopieret ind i en marketing-mockup.",
    security: "Nyttigt uden at blive usikkert",
    securityBody: "Cartwright adskiller discovery fra autoritet. Agenter kan undersøge offentlig information med det samme, mens kundedata, ordrer, checkout-state, administration og writes kræver eksplicitte scopes.",
    securityBodyDisabled: "Denne profil eksponerer kun offentligt webindhold. Den indeholder ingen kunde-, ordre-, checkout-, administrations- eller programmatisk write-overflade.",
    cta: "Start med det samme fundament",
    ctaBody: "Scaffold et rigtigt site eller en shop med SSR, structured data, developer discovery og en styret agentoverflade, der allerede hænger sammen.",
    ctaBodyDisabled: "Scaffold et let offentligt site med SSR, structured data, trust-sider og forudsigelig recovery, og tilføj først styrede agentinterfaces, når projektet har brug for dem.",
  },
} as const;

const contracts = [
  { name: "MCP", path: "/api/mcp", access: "5 anonymous read tools · Bearer for more", detail: "Streamable HTTP, handshake, tools and public resources" },
  { name: "OpenAPI 3.1", path: "/openapi.json", access: "Per-operation security", detail: "Typed inputs, outputs, errors and unique operation IDs" },
  { name: "REST tools", path: "/api/v1/tools", access: "Anonymous allowlist · scoped Bearer", detail: "One predictable path per registered operation" },
  { name: "Agent guidance", path: "/llms.txt", access: "Public", detail: "When-to-use, safety boundaries and live capabilities" },
  { name: "Recovery", path: "/this-does-not-exist", access: "Public", detail: "Real 404 with markdown-aware recovery links" },
] as const;

const agentFoundations = [
  { key: "01", title: "Server-rendered meaning", body: "Semantic headings, trust pages, canonical URLs and structured data exist in raw HTML without waiting for hydration." },
  { key: "02", title: "Protocol-native discovery", body: "MCP cards, RFC 9727 API catalog, OpenAPI and portable Agent Skills expose predictable entry points." },
  { key: "03", title: "Least-privilege authority", body: "Anonymous access is limited to published public content. Keys unlock only the scopes their owner granted." },
  { key: "04", title: "Recoverable failure", body: "Problem Details, rate-limit metadata and agent-friendly 404s tell software clients exactly what happened and what to do next." },
] as const;

const webFoundations = [
  { key: "01", title: "Server-rendered meaning", body: "Semantic headings, canonical URLs and structured data exist in raw HTML without waiting for hydration." },
  { key: "02", title: "Predictable discovery", body: "Robots, sitemap, locale alternates and agent guidance expose the public web layer at stable URLs." },
  { key: "03", title: "Visible trust", body: "About, contact and privacy pages make ownership, support and data handling discoverable." },
  { key: "04", title: "Recoverable navigation", body: "Unknown routes return a real 404 with a short path back to useful public resources." },
] as const;

function hostname(): string {
  try {
    return new URL(brand.url).hostname;
  } catch {
    return "your-domain.com";
  }
}

export default function AgenticShowcaseHomepage({
  settings,
  locale,
  agentApiEnabled,
}: DesignHomepageProps) {
  const t = locale === "da" ? copy.da : copy.en;
  const home = `/${locale}`;
  const agentInterfaceEnabled =
    agentApiEnabled ??
    (profileCapabilities.agentApi && Boolean(brand.features.mcpPublic));
  const siteName = settings?.storeName || brand.storeName;
  const auditTarget = `${hostname()}/${locale}`;
  const publicReport = `https://is-agentic.com/scan/${hostname()}/${locale}`;
  const foundations = agentInterfaceEnabled ? agentFoundations : webFoundations;

  return (
    <div className="agentic-home">
      <section className="agentic-hero">
        <div className="agentic-grid" aria-hidden="true" />
        <div className="agentic-container agentic-hero__content">
          <p className="agentic-eyebrow"><i aria-hidden="true" /> {t.eyebrow}</p>
          <h1>{t.headline}</h1>
          <p className="agentic-hero__intro">{agentInterfaceEnabled ? t.intro : t.introDisabled}</p>
          <InstallCommand command="npx create-cartwright@latest my-site" />
          <div className="agentic-hero__actions">
            <a href={agentInterfaceEnabled ? "#inspector" : "#architecture"} className="agentic-button">{agentInterfaceEnabled ? t.primary : t.primaryDisabled}</a>
            <Link href={agentInterfaceEnabled ? `${home}/developers` : `${home}/about`} className="agentic-button agentic-button--ghost">{agentInterfaceEnabled ? t.secondary : t.secondaryDisabled}</Link>
          </div>
          <ul className="agentic-signal-row" aria-label="Built-in agent foundations">
            <li><span>SSR</span> raw HTML</li>
            {agentInterfaceEnabled ? <li><span>MCP</span> Streamable HTTP</li> : null}
            {agentInterfaceEnabled ? <li><span>3.1</span> OpenAPI</li> : null}
            {!agentInterfaceEnabled ? <li><span>SEO</span> structured data</li> : null}
            <li><span>{agentInterfaceEnabled ? "RFC" : "404"}</span> {agentInterfaceEnabled ? "Problem Details" : "safe recovery"}</li>
          </ul>
        </div>
      </section>

      <section className="agentic-proof agentic-container" id="scorecard">
        <div>
          <p className="agentic-kicker">External verification</p>
          <h2>{t.proofTitle}</h2>
          <p>{agentInterfaceEnabled ? t.proofBody : t.proofBodyDisabled}</p>
        </div>
        <div className="agentic-proof__status">
          <span className="agentic-status agentic-status--pending"><i aria-hidden="true" /> {agentInterfaceEnabled ? t.pending : t.disabled}</span>
          {agentInterfaceEnabled ? <code>npx is-agentic {auditTarget}</code> : null}
          {agentInterfaceEnabled ? <a href={publicReport}>Open public scorecard ↗</a> : null}
        </div>
      </section>

      <section className="agentic-section agentic-deferred" id="architecture">
        <div className="agentic-container">
          <p className="agentic-kicker">Architecture</p>
          <div className="agentic-section__heading">
            <h2>{t.architecture}</h2>
            <p>{agentInterfaceEnabled ? t.architectureBody : t.architectureBodyDisabled}</p>
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

      {agentInterfaceEnabled ? <section className="agentic-section agentic-section--contrast agentic-deferred" id="contracts">
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
      </section> : null}

      {agentInterfaceEnabled ? <section className="agentic-section" id="inspector">
        <div className="agentic-container">
          <p className="agentic-kicker">Live inspector</p>
          <div className="agentic-section__heading">
            <h2>{t.inspector}</h2>
            <p>{t.inspectorBody}</p>
          </div>
          <EndpointExplorer enabled />
        </div>
      </section> : null}

      <section className="agentic-security agentic-deferred">
        <div className="agentic-container agentic-security__grid">
          <div>
            <p className="agentic-kicker">Security model</p>
            <h2>{t.security}</h2>
            <p>{agentInterfaceEnabled ? t.securityBody : t.securityBodyDisabled}</p>
          </div>
          <dl>
            {agentInterfaceEnabled ? <>
              <div><dt>Anonymous</dt><dd>Published products, categories and public pages only</dd></div>
              <div><dt>Scoped key</dt><dd>Exactly the reads and actions granted by the owner</dd></div>
              <div><dt>Never anonymous</dt><dd>Customers, orders, checkout state, administration and writes</dd></div>
              <div><dt>Abuse control</dt><dd>Shared per-IP budget with standard rate-limit metadata</dd></div>
            </> : <>
              <div><dt>Public web</dt><dd>Semantic HTML, structured data, sitemap and trust pages</dd></div>
              <div><dt>Agent API</dt><dd>Not included or explicitly disabled for this deployment</dd></div>
            </>}
          </dl>
        </div>
      </section>

      <section className="agentic-cta">
        <div className="agentic-container">
          <p className="agentic-kicker">Out of the box</p>
          <h2>{t.cta}</h2>
          <p>{agentInterfaceEnabled ? t.ctaBody : t.ctaBodyDisabled}</p>
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
