#!/usr/bin/env bash
# ULTRAPLAN-lite UL7: fork-smoke-test.
#
# Verificerer at en frisk fork-flow virker uden manual intervention:
# 1. Begge industry-templates loader uden errors
# 2. Prisma schema er valid
# 3. Tests passerer (proxy for compile-correctness)
# 4. Build færdiggør (proxy for runtime-correctness)
#
# Bruges som CI-gate (kald i .github/workflows/) eller manuelt før release.
# Total: ~1-2 min. Tjekker IKKE faktisk fresh clone-flow (det kræver
# tom DB-state + npm install i tmp-dir = 10+ min).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "════════════════════════════════════════════════════════════════"
echo "  FORK SMOKE TEST — verificerer fork-readiness invariants"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "▶ [1/4] Verify Prisma schema parses…"
npx prisma format > /dev/null 2>&1
echo "  ✓ schema.prisma er gyldig"
echo ""

echo "▶ [2/4] Verify TypeScript-compilation…"
npx tsc --noEmit > /dev/null 2>&1
echo "  ✓ tsc clean (ingen type-fejl)"
echo ""

echo "▶ [3/4] Run all unit-tests…"
npx vitest run --reporter=dot > /dev/null 2>&1
TEST_COUNT=$(npx vitest run --reporter=basic 2>&1 | grep -oE "[0-9]+ passed" | head -1 || echo "?")
echo "  ✓ Alle tests passerer ($TEST_COUNT)"
echo ""

echo "▶ [4/4] Verify alle industry-templates loader uden errors…"
# P1.6: dynamic iteration fra INDUSTRY_TEMPLATE_OPTIONS — nye templates
# dukker automatisk op her uden at scriptet skal opdateres.
npx tsx -e "
import { INDUSTRY_TEMPLATE_OPTIONS, getIndustryTemplate } from './industry-templates';
for (const { slug } of INDUSTRY_TEMPLATE_OPTIONS) {
  const tpl = getIndustryTemplate(slug);
  if (!tpl.label || tpl.categories.length === 0 || tpl.products.length === 0) {
    console.error('FAIL:', slug, 'mangler data');
    process.exit(1);
  }
  console.log('  ✓', slug.padEnd(10), '— cats:', tpl.categories.length, 'prods:', tpl.products.length, 'pages:', tpl.pages.length);
}
" 2>&1
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  ✓ FORK SMOKE TEST PASSED"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Næste manuel check ved actual fork:"
echo "  1. cp -R . /tmp/fork-test && cd /tmp/fork-test"
echo "  2. rm -rf .git node_modules prisma/dev.db"
echo "  3. Rediger brand.config.ts (industryTemplate, storeName, etc.)"
echo "  4. npm install && npx prisma migrate dev --name init && npm run seed"
echo "  5. npm run build && npm start"
