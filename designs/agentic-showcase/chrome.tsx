import type { ReactNode } from "react";
import Link from "next/link";
import { brand } from "@/brand.config";
import { profileCapabilities } from "@/lib/profile-capabilities";
import type { DesignChromeProps } from "../types";
import "./showcase.css";

export function AgenticShowcaseShell({ children }: { children: ReactNode; locale: string }) {
  return <div className="agentic-showcase">{children}</div>;
}

function resolveAgentApiEnabled(value: boolean | undefined): boolean {
  return value ?? (profileCapabilities.agentApi && Boolean(brand.features.mcpPublic));
}

export function AgenticShowcaseHeader({
  locale,
  agentApiEnabled,
  accountAndAdminEnabled,
}: DesignChromeProps) {
  const home = `/${locale}`;
  const publicAgentApi = resolveAgentApiEnabled(agentApiEnabled);
  const adminAvailable =
    accountAndAdminEnabled ?? profileCapabilities.accountAndAdmin;
  return (
    <header className="agentic-header">
      <nav aria-label="Primary navigation" className="agentic-container agentic-nav">
        <Link href={home} className="agentic-brand">
          <span className="agentic-mark" aria-hidden="true">▲</span>
          <span>{brand.storeName}</span>
        </Link>
        <span className="agentic-live-pill"><i aria-hidden="true" /> {publicAgentApi ? "Agent interfaces live" : "Semantic web profile"}</span>
        <div className="agentic-nav__links">
          {publicAgentApi ? <a href={`${home}#contracts`}>Contracts</a> : null}
          {publicAgentApi ? <a href={`${home}#inspector`}>Inspector</a> : null}
          {publicAgentApi ? <Link href={`${home}/developers`}>Developers</Link> : <Link href={`${home}/about`}>About</Link>}
        </div>
        <div className="agentic-nav__actions">
          <a href="/llms.txt">llms.txt</a>
          {publicAgentApi ? <a href="/openapi.json">OpenAPI</a> : null}
          {adminAvailable ? <Link href="/admin" className="agentic-button agentic-button--small">Admin</Link> : null}
        </div>
      </nav>
    </header>
  );
}

export function AgenticShowcaseFooter({
  locale,
  agentApiEnabled,
}: DesignChromeProps) {
  const year = new Date().getFullYear();
  const home = `/${locale}`;
  const publicAgentApi = resolveAgentApiEnabled(agentApiEnabled);
  return (
    <footer className="agentic-footer">
      <div className="agentic-container agentic-footer__grid">
        <div>
          <Link href={home} className="agentic-brand">
            <span className="agentic-mark" aria-hidden="true">▲</span>
            <span>{brand.storeName}</span>
          </Link>
          <p>Human-first experiences with machine-readable contracts built in.</p>
        </div>
        <div>
          <h2>Discovery</h2>
          {publicAgentApi ? <Link href="/.well-known/mcp.json">MCP server card</Link> : null}
          {publicAgentApi ? <Link href="/.well-known/api-catalog">API catalog</Link> : null}
          <Link href="/llms.txt">Agent guidance</Link>
          <Link href="/sitemap.xml">Sitemap</Link>
        </div>
        {publicAgentApi ? <div>
          <h2>Developers</h2>
          <Link href="/openapi.json">OpenAPI 3.1</Link>
          <Link href="/api/v1/tools">Tool catalog</Link>
          <Link href={`${home}/developers`}>Documentation</Link>
          <a href="https://github.com/Teloz1870/cartwright-template">Source code</a>
        </div> : null}
        <div>
          <h2>Trust</h2>
          <Link href={`${home}/about`}>About</Link>
          <Link href={`${home}/contact`}>Contact</Link>
          <Link href={`${home}/privacy`}>Privacy</Link>
          <a href="https://is-agentic.com">Independent audit</a>
        </div>
      </div>
      <div className="agentic-container agentic-footer__bottom">
        <span>© {year} {brand.storeName}</span>
        <span>No score claimed without a current public report.</span>
      </div>
    </footer>
  );
}
