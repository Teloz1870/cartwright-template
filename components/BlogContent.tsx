import { renderContentBlocks, renderInlineMarkdown } from "@/lib/content";

/**
 * Server-side render af en blog-body via den eksisterende lette markdown
 * (lib/content.ts: ## overskrift, > citat, **fed**). Semantisk HTML → godt for
 * SEO og AI-citation; ingen client-JS nødvendig.
 */
export default function BlogContent({ body }: { body: string }) {
  const blocks = renderContentBlocks(body);
  return (
    <div className="prose prose-lg max-w-none">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h2 key={i} className="mt-10 text-2xl font-black text-sol-ink sm:text-3xl">
              {block.text}
            </h2>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={i}
              className="my-6 border-l-4 border-sol-accent pl-4 text-lg italic text-sol-muted"
            >
              {renderInlineMarkdown(block.text)}
            </blockquote>
          );
        }
        return (
          <p key={i} className="mt-4 leading-7 text-sol-ink/90">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}
