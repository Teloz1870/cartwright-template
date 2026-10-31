/**
 * v0 code → HTML extraction (pure, no server deps so it's unit-testable).
 *
 * v0 emits React/TSX. Cartwright's doctrine persists AI output as *data*
 * (vibeHtml), never source files — so we extract a best-effort HTML string from
 * the generated component. This is the documented lossy step: JSX expressions
 * ({variable}) and component-driven content can't be resolved without executing
 * the code, so generated sections lean on the v0 system-prompt emitting plain,
 * self-contained Tailwind markup. Mirrors (and replaces) the client-side
 * `handleAutoClean` regex that lived in VibeSandboxClient.tsx.
 */

export type ExtractableFile = { name: string; content: string };

/** Normalize a single TSX/JSX/HTML string into storable HTML. */
export function extractHtmlFromCode(code: string): string {
  if (!code) return "";
  let out = code;

  // Drop "use client" / "use server" directives and import lines.
  out = out.replace(/^\s*["']use (client|server)["'];?\s*$/gim, "");
  out = out.replace(/^\s*import\s.*$/gim, "");

  // If it's a component, pull the JSX out of its `return ( ... )`.
  if (out.includes("export default function") || /return\s*\(/.test(out)) {
    const returnMatch = out.match(/return\s*\(\s*([\s\S]*)\s*\)\s*;?\s*}/);
    if (returnMatch && returnMatch[1]) {
      out = returnMatch[1].trim();
    }
  }

  // Strip JSX comments {/* ... */}.
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // React attribute spelling → HTML.
  out = out.replace(/className=/g, "class=");
  out = out.replace(/htmlFor=/g, "for=");

  return out.trim();
}

function isConfigOrNonUi(name: string): boolean {
  const n = name.toLowerCase();
  if (/\.(json|css|md|lock|txt|mjs|cjs|svg|png|jpe?g|ico|gif|webp)$/.test(n)) {
    return true;
  }
  if (/\.config\.[tj]sx?$/.test(n)) return true;
  if (/(^|\/)(layout|loading|error|not-found|globals|middleware)\.[tj]sx?$/.test(n)) {
    return true;
  }
  if (/(^|\/)tsconfig/.test(n)) return true;
  return false;
}

function tagCount(content: string): number {
  return (content.match(/<[a-zA-Z/]/g) ?? []).length;
}

/**
 * Pick the richest UI file out of a v0 version's files and extract its HTML.
 * Prefers a real .html file, else the JSX/TSX component with the most markup.
 * Returns "" when nothing usable is present.
 */
export function extractHtmlFromV0Files(files: ExtractableFile[]): string {
  if (!files?.length) return "";

  const usable = files.filter(
    (f) =>
      f?.content &&
      /\.(tsx|jsx|html?)$/i.test(f.name) &&
      !isConfigOrNonUi(f.name),
  );
  if (!usable.length) return "";

  const htmlFile = usable.find((f) => /\.html?$/i.test(f.name));
  if (htmlFile) return extractHtmlFromCode(htmlFile.content);

  const jsxCandidates = usable
    .filter((f) => /(return\s*\(|export default|<[a-zA-Z])/.test(f.content))
    .sort((a, b) => tagCount(b.content) - tagCount(a.content));

  const chosen = jsxCandidates[0];
  return chosen ? extractHtmlFromCode(chosen.content) : "";
}
