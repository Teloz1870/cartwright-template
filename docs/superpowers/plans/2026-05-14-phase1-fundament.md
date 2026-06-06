# solbrillen.dk — Fase 1: Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Et kørende Next.js-projekt med Prisma + SQLite, fuldt datamodel-schema, og et seed-script der fylder databasen med kategorier, ~24 fiktive solbriller og en admin-bruger.

**Architecture:** Ét Next.js 16-projekt (App Router, TypeScript). Prisma ORM mod SQLite. Forretningslogik isoleres i `lib/`. Vitest sættes op så senere faser kan TDD'e pris-/kurv-logik.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Prisma 6 (pinned — v7's driver-adapter model er undgået for demo-forudsigelighed), SQLite, Vitest, bcryptjs.

---

### Task 1: Scaffold Next.js-projekt

**Files:**
- Create: hele Next.js-skelettet i projektroden `/Users/kennimadsen/Documents/solbrillen.dk/`

- [ ] **Step 1: Scaffold ind i en midlertidig mappe og flyt indhold**

Projektroden indeholder allerede `.git/`, `.gitignore`, `docs/`. `create-next-app` vil ikke skrive i en ikke-tom mappe, så scaffold i temp og flet ind.

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npx --yes create-next-app@latest .tmp-scaffold --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm
shopt -s dotglob
cp -r .tmp-scaffold/* .tmp-scaffold/.* . 2>/dev/null || true
rm -rf .tmp-scaffold
shopt -u dotglob
```

- [ ] **Step 2: Verificér at dev-serveren starter**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk && npm run build
```
Expected: build lykkes uden fejl ("Compiled successfully").

- [ ] **Step 3: Sæt dansk sprog på root layout**

Modify: `app/layout.tsx` — skift `<html lang="en">` til `<html lang="da">`, og sæt metadata:
```tsx
export const metadata: Metadata = {
  title: "solbrillen.dk — Solbriller til sommeren",
  description: "Danmarks webshop for solbriller. Find dine næste solbriller.",
};
```

- [ ] **Step 4: Commit**

```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
git add -A
git commit -m "Scaffold Next.js 15 project with TypeScript and Tailwind"
```

---

### Task 2: Installér og konfigurér Prisma + SQLite

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env`
- Create: `lib/db.ts`

- [ ] **Step 1: Installér Prisma og afhængigheder**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npm install -D prisma@^6
npm install @prisma/client@^6 bcryptjs
npm install -D @types/bcryptjs
npx prisma init --datasource-provider sqlite
```

> **Pin Prisma til v6.** v7 indfører en obligatorisk driver-adapter-model (`new PrismaClient()` virker ikke uden argument, custom generator-output, `prisma.config.ts`, native `better-sqlite3`). v6 beholder den klassiske `prisma-client-js`-generator, `env("DATABASE_URL")` i schemaet, zero-arg `new PrismaClient()`, og `prisma migrate dev` / `prisma db seed` som resten af planen forudsætter.

- [ ] **Step 2: Sæt DATABASE_URL i `.env`**

Create/overskriv `.env`:
```
DATABASE_URL="file:./dev.db"
```
(`.env` er allerede i `.gitignore`.)

- [ ] **Step 3: Skriv Prisma-klient-singleton**

Create `lib/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add Prisma with SQLite datasource and client singleton"
```

---

### Task 3: Definér datamodel-schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Skriv hele schemaet**

Overskriv modeldelen af `prisma/schema.prisma` (behold `generator` og `datasource`-blokkene fra `prisma init`):
```prisma
model Category {
  id       String    @id @default(cuid())
  name     String
  slug     String    @unique
  products Product[]
}

model Product {
  id          String      @id @default(cuid())
  name        String
  slug        String      @unique
  description String
  priceDkk    Int         // pris i øre
  images      String      // JSON-array af billede-URLs
  stock       Int         @default(0)
  frameColor  String
  lensColor   String
  brand       String
  featured    Boolean     @default(false)
  categoryId  String
  category    Category    @relation(fields: [categoryId], references: [id])
  cartItems   CartItem[]
  orderItems  OrderItem[]
  createdAt   DateTime    @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         String   @default("customer") // "customer" | "admin"
  carts        Cart[]
  orders       Order[]
  createdAt    DateTime @default(now())
}

model Cart {
  id        String     @id @default(cuid())
  sessionId String?    @unique
  userId    String?
  user      User?      @relation(fields: [userId], references: [id])
  items     CartItem[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model CartItem {
  id        String  @id @default(cuid())
  cartId    String
  cart      Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int     @default(1)

  @@unique([cartId, productId])
}

model Order {
  id              String      @id @default(cuid())
  userId          String?
  user            User?       @relation(fields: [userId], references: [id])
  email           String
  status          String      @default("pending") // pending | paid | shipped | cancelled
  shippingName    String
  shippingAddress String
  shippingZip     String
  shippingCity    String
  subtotalDkk     Int
  shippingDkk     Int
  discountDkk     Int         @default(0)
  totalDkk        Int
  discountCode    String?
  items           OrderItem[]
  createdAt       DateTime    @default(now())
}

model OrderItem {
  id           String  @id @default(cuid())
  orderId      String
  order        Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId    String
  product      Product @relation(fields: [productId], references: [id])
  productName  String  // snapshot
  unitPriceDkk Int     // snapshot
  quantity     Int
}

model DiscountCode {
  id         String    @id @default(cuid())
  code       String    @unique
  type       String    // "percent" | "fixed"
  value      Int       // procent (0-100) eller øre
  validUntil DateTime?
  usageLimit Int?
  usageCount Int       @default(0)
  active     Boolean   @default(true)
}
```

- [ ] **Step 2: Kør migration**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npx prisma migrate dev --name init
```
Expected: "Your database is now in sync with your schema." og en mappe `prisma/migrations/` oprettes.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add full Prisma data model and initial migration"
```

---

### Task 4: Seed-script med fiktive solbriller

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (tilføj `prisma.seed`-felt og `ts-node`-dev-dependency)

- [ ] **Step 1: Installér ts-node til seed-kørsel**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npm install -D ts-node
```

- [ ] **Step 2: Tilføj seed-konfiguration til `package.json`**

Modify `package.json` — tilføj på øverste niveau:
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

- [ ] **Step 3: Skriv seed-scriptet**

Create `prisma/seed.ts`:
```ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "Herre", slug: "herre" },
  { name: "Dame", slug: "dame" },
  { name: "Sport", slug: "sport" },
  { name: "Polariseret", slug: "polariseret" },
  { name: "Børn", slug: "born" },
];

const BRANDS = ["Solir", "Nordlys", "Kystlinje", "Bølge", "Solskin"];
const FRAME_COLORS = ["Sort", "Skildpadde", "Transparent", "Guld", "Navy"];
const LENS_COLORS = ["Grå", "Brun", "Spejlblå", "Grøn", "Gradueret"];
const MODELS = [
  "Skagen", "Marbella", "Riviera", "Tropea", "Bondi", "Capri",
  "Lido", "Malibu", "Tulum", "Amalfi", "Nice", "Biarritz",
  "Ipanema", "Santorini", "Cascais", "Hossegor", "Byron", "Noosa",
  "Tofino", "Essaouira", "Phuket", "Mykonos", "Ericeira", "Uluwatu",
];

// Stabile Unsplash-billeder af solbriller
const IMAGES = [
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800",
  "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800",
  "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800",
  "https://images.unsplash.com/photo-1577803645773-f96470509666?w=800",
  "https://images.unsplash.com/photo-1502767089025-6572583495b0?w=800",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800",
];

async function main() {
  // Ryd eksisterende data (idempotent seed)
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.user.deleteMany();

  const categories = [];
  for (const c of CATEGORIES) {
    categories.push(await prisma.category.create({ data: c }));
  }

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const brand = BRANDS[i % BRANDS.length];
    const category = categories[i % categories.length];
    const priceKr = 299 + (i % 8) * 100; // 299–999 kr
    await prisma.product.create({
      data: {
        name: `${brand} ${model}`,
        slug: `${brand}-${model}`.toLowerCase().replace(/\s+/g, "-"),
        description: `${brand} ${model} — letvægts solbrille med UV400-beskyttelse og polariserede glas. Komfortabel pasform til hverdag og ferie.`,
        priceDkk: priceKr * 100,
        images: JSON.stringify([IMAGES[i % IMAGES.length]]),
        stock: 3 + (i % 20),
        frameColor: FRAME_COLORS[i % FRAME_COLORS.length],
        lensColor: LENS_COLORS[i % LENS_COLORS.length],
        brand,
        featured: i % 6 === 0,
        categoryId: category.id,
      },
    });
  }

  await prisma.discountCode.create({
    data: { code: "SOMMER10", type: "percent", value: 10, active: true },
  });
  await prisma.discountCode.create({
    data: { code: "VELKOMST50", type: "fixed", value: 5000, active: true },
  });

  await prisma.user.create({
    data: {
      email: "admin@solbrillen.dk",
      passwordHash: await bcrypt.hash("admin1234", 10),
      name: "Administrator",
      role: "admin",
    },
  });

  console.log("Seed færdig: 5 kategorier, 24 produkter, 2 rabatkoder, 1 admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Kør seed**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npx prisma db seed
```
Expected: "Seed færdig: 5 kategorier, 24 produkter, 2 rabatkoder, 1 admin."

- [ ] **Step 5: Verificér data i databasen**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npx prisma db execute --stdin <<'SQL'
SELECT (SELECT COUNT(*) FROM Product) AS produkter,
       (SELECT COUNT(*) FROM Category) AS kategorier,
       (SELECT COUNT(*) FROM User) AS brugere;
SQL
```
Expected: produkter=24, kategorier=5, brugere=1.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add seed script with 24 fictive sunglasses, categories, discount codes, admin"
```

---

### Task 5: Sæt Vitest op og test seed-data-integritet

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/products.ts`
- Create: `tests/unit/products.test.ts`
- Modify: `package.json` (tilføj `test`-script)

- [ ] **Step 1: Installér Vitest**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk
npm install -D vitest
```

- [ ] **Step 2: Skriv Vitest-config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: Tilføj test-script til `package.json`**

Modify `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Skriv den fejlende test**

Create `tests/unit/products.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseProductImages } from "@/lib/products";

describe("parseProductImages", () => {
  it("parser en JSON-array-streng til et array af URLs", () => {
    const result = parseProductImages('["https://a.dk/1.jpg","https://a.dk/2.jpg"]');
    expect(result).toEqual(["https://a.dk/1.jpg", "https://a.dk/2.jpg"]);
  });

  it("returnerer tomt array for ugyldig JSON", () => {
    expect(parseProductImages("ikke json")).toEqual([]);
  });

  it("returnerer tomt array for tom streng", () => {
    expect(parseProductImages("")).toEqual([]);
  });
});
```

- [ ] **Step 5: Kør testen og bekræft den fejler**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk && npm test
```
Expected: FAIL — "Cannot find module '@/lib/products'".

- [ ] **Step 6: Skriv minimal implementation**

Create `lib/products.ts`:
```ts
/** Parser den JSON-array-streng af billed-URLs der gemmes på Product.images. */
export function parseProductImages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 7: Kør testen og bekræft den passerer**

Run:
```bash
cd /Users/kennimadsen/Documents/solbrillen.dk && npm test
```
Expected: PASS — 3 tests passerer.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Set up Vitest and add parseProductImages helper with tests"
```

---

### Task 6: Projekt-README med kørselsvejledning

**Files:**
- Create: `README.md`

- [ ] **Step 1: Skriv README**

Create `README.md`:
```markdown
# solbrillen.dk

Komplet webshop for solbriller — pitch/demo-prototype. Next.js full-stack, Prisma + SQLite.

## Kom i gang

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Åbn http://localhost:3000

## Admin

- URL: /admin
- Login: admin@solbrillen.dk / admin1234

## Rabatkoder (demo)

- `SOMMER10` — 10% rabat
- `VELKOMST50` — 50 kr rabat

## Test

```bash
npm test
```

## Status

Bygges i faser — se `docs/superpowers/plans/`. Fase 1 (Fundament) færdig.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "Add project README with setup instructions"
```

---

## Self-Review

**1. Spec coverage (Fase 1):** Next.js-projekt ✓ (Task 1), Tailwind ✓ (Task 1, via create-next-app), Prisma-schema ✓ (Task 3 — alle 8 modeller fra spec §5), `lib/db.ts` ✓ (Task 2), seed med ~20-30 produkter ✓ (Task 4 — 24 produkter, 5 kategorier, admin-bruger, 2 rabatkoder), Vitest-opsætning ✓ (Task 5), README ✓ (Task 6).

**2. Placeholder scan:** Ingen TBD/TODO. Al kode er konkret.

**3. Type-konsistens:** `parseProductImages` defineres i Task 5 og bruges kun der. Prisma-modelfelter (`priceDkk`, `images`, `stock` osv.) matcher spec §5. Priser i øre konsekvent (`priceKr * 100`).

**Note:** Tailwind v4 (fra create-next-app@latest) bruger `@import "tailwindcss"` i `app/globals.css` — ingen separat `tailwind.config`-tilretning nødvendig i Fase 1. Designsystem (visuel retning B) bygges i Fase 2.
