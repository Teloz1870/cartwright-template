# Cartwright 2.0 - Vibe Coding Instructions

Copy and paste this instruction set into **v0.dev**, **Bolt.new**, **Lovable**, or **Cursor Composer** as a system prompt or custom instruction. It ensures that any UI generated aligns perfectly with the Cartwright 2.0 Engine architecture.

---

## 🏗 System Context
- **Framework:** Next.js 15 (App Router), React 19
- **Styling:** Tailwind CSS v4
- **Platform Name:** Cartwright 2.0 Engine (Agentic Commerce / B2B SaaS Platform)
- **Theme:** Dark Mode by default (SaaS aesthetic). Avoid `bg-white` and pure `text-black` unless inside specific light mode components.

## 🎨 Theme & Design Tokens (Tailwind v4)
You MUST use these specific semantic color variables for consistency. DO NOT use raw hex codes.
- **Backgrounds:** 
  - `bg-[#0A0A0A]` or `bg-black` for main dark surfaces.
  - `bg-sol-sand` (Light beige/sand) for secondary light panels.
  - `bg-sol-cream` (Cream) for primary light surfaces.
- **Text:** 
  - `text-white`, `text-gray-300`, `text-white/60` for dark themes.
  - `text-sol-ink` (Deep black/blue) for light panels.
  - `text-sol-muted` for secondary text on light panels.
- **Accents:** 
  - `bg-sol-accent` and `text-sol-accent` (Vibrant highlight, usually blue/indigo).
- **Glassmorphism:** Use `bg-white/5 backdrop-blur-md border border-white/10` for premium floating elements.

## 📝 Output Rules for the Cartwright Sandbox
If the user asks you to generate code intended for the **Cartwright Vibe Sandbox** (`/admin/vibe-sandbox`):
1. **Output ONLY valid HTML markup with Tailwind classes.**
2. Do NOT output a full React component (no `export default function...`).
3. Do NOT use React Hooks (`useState`, `useEffect`) or event handlers (`onClick={...}`). The sandbox does not execute Javascript.
4. Replace all `className=` with `class=`.
5. Ensure all self-closing tags (like `<img />`, `<input />`) are properly closed.
6. Make it fully responsive (`sm:`, `md:`, `lg:` prefixes).
7. Wrap your output in a single parent `<div>` or `<section>`.

## 💻 Output Rules for Cursor Composer
If the user asks you to modify code directly in the filesystem via **Cursor Composer**:
1. You may use full React server or client components (`"use client"`).
2. Ensure you respect the `app/[locale]/...` structure if creating new pages.
3. Keep database interactions strict: DO NOT bypass Prisma (`import { prisma } from "@/lib/db"`). Do not write raw SQL.
4. Ensure text that needs translating utilizes `next-intl` (`useTranslations()`) if you are working outside the Vibe Sandbox.
