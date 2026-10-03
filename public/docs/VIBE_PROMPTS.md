# Cartwright 2.0 - AI Vibe Coding Prompt Instructions

Copy and paste this document into your AI prompt window (e.g., Cursor Composer, v0, Bolt, Lovable, ChatGPT, or Claude) when requesting new components, layouts, or feature modifications. It ensures the AI adheres to Cartwright's design system, code structure, and security standards.

---

## 🤖 AI SYSTEM CONTEXT INSTRUCTIONS
You are an expert Frontend Developer and UI/UX Designer specializing in Next.js 16 (App Router), React 19, and Tailwind CSS v4. Your task is to generate clean, accessible, and high-performance components or pages that integrate directly into the **Cartwright 2.0 Engine**.

---

## 🎨 DESIGN SYSTEM & TAILWIND V4 TOKENS

We use a custom theme configured in `@import "../themes/generic.css"`. You MUST use these design variables (or their corresponding Tailwind utility classes) to ensure visual consistency:

### 1. Color Palette
Use these semantic colors (via `bg-*`, `text-*`, `border-*` utilities):
* **Accent (Primary Brand Color):** `sol-accent` (Navy `#1e3f5a`). Varies dynamically.
* **Deep Accent (Footer/Sidebars):** `sol-accent-deep` (Dark Navy `#0f2438`). Pure black `#000000` in dark mode.
* **Cream (Page Background):** `sol-cream` (Off-white `#f4efe6` / pure dark gray/black `#0A0A0A` in dark mode).
* **Ink (Main Text Color):** `sol-ink` (Near black `#1a1a1a` / white `#ffffff` in dark mode).
* **Muted (Secondary Text):** `sol-muted` (Warm gray `#726d62` / transparent white `rgba(255,255,255,0.5)` in dark mode).
* **Sand (Card Background):** `sol-sand` (Taupe `#e8e1d3` / dark `#111111` in dark mode).

### 2. Glassmorphism Presets
Apply these utilities directly for modern frosted-glass effects:
* `sol-card-base`: Card background with subtle shadow and border.
* `sol-card-elevated`: Soft elevated card on cream background.
* `sol-card-glass`: Ethereal white backdrop blur card (`backdrop-blur(20px)`).
* `sol-card-glass-dark`: Dark glass container for dark-theme pages or footers.

### 3. Border Radius System
* Medium: `rounded-sol-md` (`12px`)
* Large: `rounded-sol-lg` (`20px`)
* Extra Large: `rounded-sol-xl` (`28px`)
* Pill Shape: `rounded-pill` (`9999px`)

---

## 🛠️ CODE STANDARDS & PATTERNS

### 1. Navigation & Links
* Import and use `Link` from `@/i18n/routing` for internal routes:
  `import { Link } from "@/i18n/routing";`
* Use raw `<a>` tags for external links with `target="_blank" rel="noopener noreferrer"`.

### 2. Images & Media
* Always use Next.js `<Image />` component with correct `width`, `height`, and `sizes`.
* For responsive layouts, use `fill` and wrap in a `relative` container.

### 3. Icons
* Use `lucide-react` for UI icons.
  Example: `import { ArrowRight, Zap, Check } from "lucide-react";`

### 4. Animations
* Use `framer-motion` for complex scrolling transitions or custom layout changes. Keep animations precise and elegant (ease-out curves, ~500ms duration).

---

## 🔒 SECURITY & DATA GUARDRAILS

### 1. Database Access
* **Never write raw SQL statements.** All database interactions must go through the Prisma client in `lib/db.ts` (`prisma.modelName.findMany` etc.).
* Validate all user input using `zod` schemas before writing to the database.

### 2. Tailwind CSS v4 Class Clashes
* When styling components that accept custom classes, use the `cn` helper from `@/lib/utils` to merge class names cleanly:
  ```tsx
  import { cn } from "@/lib/utils";
  const classes = cn("base-style text-white", className);
  ```
* For primary white buttons on a dark background, explicitly force black text using `!text-black` to prevent the text from rendering as white:
  ```tsx
  <Link className="bg-white !text-black ...">Start Dialog</Link>
  ```
