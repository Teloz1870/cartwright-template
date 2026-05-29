"use client";

import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { ContentBlock } from "@/lib/content";

type AnimatedPageContentProps = {
  page: {
    title: string;
    heroImage: string | null;
  };
  blocks: ContentBlock[];
};

/**
 * Phase I post-polish (2026-05-28): replaced ALL hardcoded colors with
 * theme tokens (sol-cream, sol-ink, sol-accent, sol-sand, sol-muted).
 *
 * Before: bg-black + text-white + bg-indigo-* + bg-[#111] — Cartwright-
 * studio-purple aesthetic baked in, ignored every shop's theme palette.
 * Result on Northbound: cream-and-orange header sits on top of a pitch-
 * black + indigo-accent info page. Same anti-pattern as the Phase F1
 * HeaderClient + Phase G ConsentBanner fixes.
 *
 * Now: every surface, text, accent, and border reads from the theme
 * token system. Each canary's theme CSS decides the actual color.
 */
export default function AnimatedPageContent({ page, blocks }: AnimatedPageContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallax for hero image
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const yParallax = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacityFade = useTransform(scrollYProgress, [0, 0.5], [0.5, 0]);

  // Extract headings for Table of Contents (TOC)
  const headings = blocks.filter((b) => b.type === "heading");

  return (
    <div ref={containerRef} className="bg-sol-cream min-h-screen text-sol-ink">
      {/* 1. Cinematic Hero Section */}
      {page.heroImage ? (
        <div className="relative h-[50vh] sm:h-[70vh] w-full flex items-end pb-16 sm:pb-24 bg-sol-ink overflow-hidden">
          <motion.div
            className="absolute inset-0 z-0"
            style={{ y: yParallax, opacity: opacityFade }}
          >
            <Image
              src={page.heroImage}
              alt={page.title}
              fill
              sizes="100vw"
              className="object-cover mix-blend-overlay"
              priority
            />
          </motion.div>
          {/* Liquid dark gradient — uses theme ink token so each canary's
              hero overlay matches its accent-deep cast. */}
          <div className="absolute inset-0 bg-gradient-to-t from-sol-ink via-sol-ink/50 to-transparent z-10" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter"
              style={{ textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
            >
              {page.title}
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 1, delay: 0.6, ease: "easeInOut" }}
              className="h-1 w-24 bg-sol-accent mt-8 origin-left"
            />
          </div>
        </div>
      ) : null}

      {/* 2. Asymmetric content layout — theme-aware throughout */}
      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${
          page.heroImage ? "py-16 sm:py-24" : "pt-32 pb-16 sm:pt-40 sm:pb-24"
        }`}
      >
        {!page.heroImage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h1 className="text-6xl sm:text-8xl font-black text-sol-ink tracking-tighter mb-6 leading-[1.1]">
              {page.title.split(" ").slice(0, -1).join(" ")}{" "}
              <span className="text-sol-accent">
                {page.title.split(" ").slice(-1)}
              </span>
            </h1>
            <div className="h-1 w-24 bg-sol-accent rounded-full" />
          </motion.div>
        )}

        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 relative">
          {/* Main Content (Left) */}
          <div className="lg:w-2/3 space-y-12">
            {blocks.map((block, index) => {
              if (block.type === "heading") {
                return (
                  <motion.h2
                    key={`${block.type}-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="text-3xl sm:text-4xl font-black text-sol-ink mt-16 first:mt-0 tracking-tight"
                  >
                    {block.text}
                  </motion.h2>
                );
              }

              if (block.type === "quote") {
                return (
                  <motion.blockquote
                    key={`${block.type}-${index}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="relative p-8 sm:p-12 my-12 rounded-3xl backdrop-blur-md bg-sol-sand border border-sol-ink/10 shadow-xl"
                  >
                    <div className="absolute top-8 left-8 text-6xl text-sol-accent/30 font-serif leading-none">
                      &quot;
                    </div>
                    <p className="relative z-10 text-2xl sm:text-3xl text-sol-ink font-serif font-medium italic leading-snug">
                      {block.text}
                    </p>
                  </motion.blockquote>
                );
              }

              return (
                <motion.p
                  key={`${block.type}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6 }}
                  className="text-lg sm:text-xl text-sol-ink/80 leading-relaxed font-light whitespace-pre-line"
                >
                  {block.text}
                </motion.p>
              );
            })}
          </div>

          {/* Sticky Sidebar (Right) */}
          <div className="lg:w-1/3 hidden lg:block">
            <div className="sticky top-32 p-8 rounded-3xl bg-sol-sand/60 backdrop-blur-sm border border-sol-ink/10 shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-sol-accent mb-6">
                On this page
              </h3>
              {headings.length > 0 ? (
                <ul className="space-y-4">
                  {headings.map((heading, i) => (
                    <li key={i}>
                      <span className="text-sm font-medium text-sol-muted hover:text-sol-ink transition-colors cursor-pointer">
                        {heading.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-sol-muted italic">No sections found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
