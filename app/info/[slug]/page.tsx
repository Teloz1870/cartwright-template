import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const page = await prisma.page.findUnique({ where: { slug } });

  return { title: page?.title ?? "Side ikke fundet" };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();

  const blocks = renderContentBlocks(page.body);

  return (
    <div>
      <div className="bg-sol-accent py-16">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl sm:text-5xl font-black text-white">
            {page.title}
          </h1>
        </div>
      </div>

      <div className="bg-sol-cream py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4">
          {blocks.map((block, index) => {
            if (block.type === "heading") {
              return (
                <h2
                  key={`${block.type}-${index}`}
                  className={`text-2xl font-black text-sol-ink mb-3 ${
                    index === 0 ? "mt-0" : "mt-10"
                  }`}
                >
                  {block.text}
                </h2>
              );
            }

            return (
              <p
                key={`${block.type}-${index}`}
                className="text-sol-muted leading-8 mb-4 whitespace-pre-line"
              >
                {block.text}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
