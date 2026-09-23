import type { DesignPack } from "../types";
import AgenticShowcaseHomepage from "./homepage";
import {
  AgenticShowcaseFooter,
  AgenticShowcaseHeader,
  AgenticShowcaseShell,
} from "./chrome";

export const agenticShowcaseDesign: DesignPack = {
  slug: "agentic-showcase",
  name: "Agentic Showcase",
  description:
    "A premium dark technical showcase for Cartwright's full agentic profile. It demonstrates live MCP, OpenAPI, REST, trust and recovery contracts without claiming an external score before a current public report exists.",
  mode: "both",
  chrome: "dark",
  premium: true,
  source: "design.md",
  applyPaletteAsTheme: true,
  mixable: false,
  tokens: {
    prefix: "agentic",
    palette: {
      accent: "#f5f5f5",
      accentDeep: "#ffffff",
      cream: "#050505",
      sand: "#101010",
      ink: "#f5f5f5",
      muted: "#a3a3a3",
    },
    fonts: {
      sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
      display: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    },
  },
  homepage: AgenticShowcaseHomepage,
  layout: { mainClassName: "" },
  siteChrome: {
    Shell: AgenticShowcaseShell,
    Header: AgenticShowcaseHeader,
    Footer: AgenticShowcaseFooter,
  },
};
