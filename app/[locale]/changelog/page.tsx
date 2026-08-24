/**
 * Changelog page — renders CHANGELOG.md from repo root.
 *
 * Linked from:
 *   - components/Footer.tsx ("Audit feed" link)
 *   - components/AnnouncementBar.tsx ("see what I am doing today" link)
 *
 * Both expected /changelog to exist; until v0.8.0 polish it 404'd.
 *
 * Implementation notes:
 *   - Server component, reads CHANGELOG.md at request time so a fresh
 *     publish auto-reflects on next page-load (Next.js default behavior
 *     for dynamic server components).
 *   - Minimal inline markdown parser — only handles the constructs our
 *     CHANGELOG actually uses (h1-h4, bullets, paragraphs, code blocks).
 *     Avoids a markdown-lib dependency for ~40 lines of code.
 *   - Falls back gracefully if CHANGELOG.md is missing (customer scaffolds
 *     may not have one before they tag their first release).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { pageOg } from "@/lib/og";

const CHANGELOG_DESCRIPTION = `Recent updates and releases shipped on ${brand.storeName}.`;

export const metadata: Metadata = {
  title: `Changelog | ${brand.storeName}`,
  description: CHANGELOG_DESCRIPTION,
  ...pageOg("Changelog", CHANGELOG_DESCRIPTION),
};

function renderMarkdown(md: string): React.ReactElement[] {
  const blocks: React.ReactElement[] = [];
  const lines = md.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Code fence
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="my-4 overflow-x-auto rounded-lg bg-sol-ink/5 p-4 text-xs leading-relaxed text-sol-ink"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const sizes = {
        1: "text-4xl font-black mt-8 mb-4 tracking-tight",
        2: "text-2xl font-black mt-10 mb-3 border-b border-sol-ink/10 pb-2",
        3: "text-xl font-black mt-6 mb-2",
        4: "text-base font-black mt-4 mb-2 uppercase tracking-wide text-sol-muted",
      };
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(
        <Tag key={key++} className={sizes[level as 1 | 2 | 3 | 4]}>
          {text}
        </Tag>,
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-3 ml-5 list-disc space-y-1.5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("- ") &&
      !lines[i].startsWith("* ")
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-3 text-sm leading-relaxed text-sol-ink">
        {renderInline(paraLines.join(" "))}
      </p>,
    );
  }

  return blocks;
}

/**
 * Inline formatting: `code`, **bold**, links.
 * Implemented as plain-text segmenter rather than dangerouslySetInnerHTML
 * to keep XSS-surface zero.
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    // Markdown link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      { match: codeMatch, kind: "code" as const },
      { match: boldMatch, kind: "bold" as const },
      { match: linkMatch, kind: "link" as const },
    ].filter((m) => m.match !== null);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    // Find earliest match
    matches.sort(
      (a, b) => (a.match?.index ?? 0) - (b.match?.index ?? 0),
    );
    const first = matches[0];
    const m = first.match!;
    const start = m.index ?? 0;

    if (start > 0) parts.push(remaining.slice(0, start));

    if (first.kind === "code") {
      parts.push(
        <code
          key={idx++}
          className="rounded bg-sol-ink/10 px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {m[1]}
        </code>,
      );
    } else if (first.kind === "bold") {
      parts.push(
        <strong key={idx++} className="font-black">
          {m[1]}
        </strong>,
      );
    } else if (first.kind === "link") {
      parts.push(
        <a
          key={idx++}
          href={m[2]}
          className="text-sol-accent underline-offset-4 hover:underline"
        >
          {m[1]}
        </a>,
      );
    }

    remaining = remaining.slice(start + m[0].length);
  }

  return <>{parts}</>;
}

export default function ChangelogPage() {
  let content = "";
  try {
    content = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    content = `# Changelog\n\nNo CHANGELOG.md found in this project yet. Tag a release to start the log.`;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="prose prose-sm max-w-none">{renderMarkdown(content)}</div>
    </main>
  );
}
