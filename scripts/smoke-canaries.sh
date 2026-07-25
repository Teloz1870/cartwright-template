#!/bin/bash
# scripts/smoke-canaries.sh
#
# Phase G safeguard (2026-05-28) — runs HTTP + content checks against the
# 3-canary mosaic. Exits 0 only when all canaries match their identity
# contract (see CLAUDE.md "Canary identity at a glance").
#
# When to run:
#   - After any change to brand.config.ts, themes/*.css, app/globals.css,
#     app/[locale]/layout.tsx, components/Header*.tsx, components/Footer.tsx,
#     components/HeroVideo.tsx, or lib/brand.ts on main OR before pushing
#     a cherry-pick to demo/* branches.
#   - As a pre-merge gate when reviewing a PR that touches any of the above.
#
# Output:
#   ✅ <canary>  /da: 200  /produkter: 200  …  identity-markers OK
#   ❌ <canary>  /da: 200  /produkter: 500  …  MISSING "coffee" marker
#
# Exits 1 on any failure (use in CI / pre-push hook).

set -u

PASS=0
FAIL=0

check_http() {
  local url=$1
  local expected=$2
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$actual" = "$expected" ]; then
    echo "    /$(basename $url): $actual ✓"
    return 0
  else
    echo "    /$(basename $url): $actual (expected $expected) ✗"
    return 1
  fi
}

contains() {
  local url=$1
  local needle=$2
  local label=$3
  if curl -s "$url" | grep -q -- "$needle"; then
    echo "    contains '$label' ✓"
    return 0
  else
    echo "    MISSING '$label' ✗"
    return 1
  fi
}

does_not_contain() {
  local url=$1
  local needle=$2
  local label=$3
  if curl -s "$url" | grep -q -- "$needle"; then
    echo "    UNEXPECTED '$label' ✗"
    return 1
  else
    echo "    no '$label' ✓"
    return 0
  fi
}

# Check the rendered-HTML's `ecommerceEnabled` value in the brand-config JSON
# blob that gets sent to clients for hydration. This is a reliable contract
# check — if a website-mode shop suddenly serializes ecommerceEnabled:true,
# the entire UI flips even before any specific link appears.
ecommerce_flag() {
  local url=$1
  local expected=$2  # "true" or "false"
  local actual
  # JSON in HTML is escaped (\"ecommerceEnabled\":false) so match both forms
  actual=$(curl -s "$url" | grep -oE '(\\"|")ecommerceEnabled(\\"|"):(true|false)' | head -1 | grep -oE '(true|false)$')
  if [ "$actual" = "$expected" ]; then
    echo "    ecommerceEnabled=$actual ✓"
    return 0
  else
    echo "    ecommerceEnabled=$actual (expected $expected) ✗"
    return 1
  fi
}

# ─── Teloz (corporate, website-mode) ──────────────────────────────────────
echo "▶ teloz-showcase.vercel.app — website-mode, no cart, saas-dark"
TELOZ=https://teloz-showcase.vercel.app
ok=0
check_http "$TELOZ/da" 200 || ok=1
contains "$TELOZ/da" "Teloz" "Teloz brand name" || ok=1
ecommerce_flag "$TELOZ/da" "false" || ok=1
does_not_contain "$TELOZ/da" "Demo store - test mode" "demo store banner" || ok=1
does_not_contain "$TELOZ/da" "data-first-run-welcome" "first-run welcome canvas" || ok=1
check_http "$TELOZ/da/built-with-cartwright" 200 || ok=1
if [ $ok -eq 0 ]; then echo "  ✅ Teloz OK"; PASS=$((PASS+1)); else echo "  ❌ Teloz FAILED"; FAIL=$((FAIL+1)); fi
echo

# Crawls footer + header links and asserts every internal navigable URL
# returns 200. Catches regressions where pages get unlinked or DB rows
# get out of sync with footer/header expectations (Phase I-5).
crawl_internal_links() {
  local origin=$1
  local label=$2
  local html
  html=$(curl -s "$origin/da")
  # Strip _next assets + duplicates; keep only Danish-prefixed page-like paths
  local urls
  urls=$(echo "$html" \
    | grep -oE 'href="(/[^"]*)"' \
    | sed 's/href="//;s/"//' \
    | grep -vE '^/_next|^/api/|^/icon|^/manifest|\.xml$|\.txt$|\.jpg$|\.png$|\.webp$' \
    | grep -vE '^/(robots|sitemap|llms)' \
    | sort -u)
  local failures=0
  for path in $urls; do
    # Skip locale-bare paths — Next.js routing prefixes them anyway
    [ "$path" = "/" ] && continue
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$origin$path")
    if [ "$code" != "200" ] && [ "$code" != "307" ]; then
      echo "    link $path: $code (expected 200) ✗"
      failures=$((failures+1))
    fi
  done
  if [ $failures -eq 0 ]; then
    echo "    crawled $label links: all 200 ✓"
    return 0
  else
    echo "    crawled $label links: $failures broken ✗"
    return 1
  fi
}

# ─── Northbound demo (modern shop, coffee theme) ──────────────────────────
echo "▶ demo.cartwright.app — webshop, coffee theme, hero-v1 video"
NB=https://demo.cartwright.app
ok=0
check_http "$NB/da" 200 || ok=1
check_http "$NB/da/produkter" 200 || ok=1
check_http "$NB/da/built-with-cartwright" 200 || ok=1
contains "$NB/da" "Northbound" "Northbound brand name" || ok=1
ecommerce_flag "$NB/da" "true" || ok=1
contains "$NB/da" "hero-poster-v1" "coffee hero poster" || ok=1
contains "$NB/da/produkter" "Ethiopia" "coffee product name" || ok=1
does_not_contain "$NB/da/produkter" "Produkt Alpha" "generic placeholder leak" || ok=1
does_not_contain "$NB/da" "data-first-run-welcome" "first-run welcome canvas" || ok=1
crawl_internal_links "$NB" "Northbound" || ok=1
if [ $ok -eq 0 ]; then echo "  ✅ Northbound OK"; PASS=$((PASS+1)); else echo "  ❌ Northbound FAILED"; FAIL=$((FAIL+1)); fi
echo

# ─── Solbrillen (max-features webshop) ────────────────────────────────────
echo "▶ solbrillen-dk-teloz1.vercel.app — webshop, solbrillen identity, apex design"
SOL=https://solbrillen-dk-teloz1.vercel.app
ok=0
check_http "$SOL/da" 200 || ok=1
check_http "$SOL/da/produkter" 200 || ok=1
check_http "$SOL/da/built-with-cartwright" 200 || ok=1
contains "$SOL/da" "Solbrillen" "Solbrillen brand name" || ok=1
ecommerce_flag "$SOL/da" "true" || ok=1
# Apex redesign (2026-06-11): the cw-* atom hero proves the palette-adaptive
# apex design is active (replaced the old hero-v4 video assertion).
contains "$SOL/da" "text-cw-stone-900" "apex cw-atom hero" || ok=1
contains "$SOL/da/produkter" "Aviator" "sunglasses product name" || ok=1
does_not_contain "$SOL/da/produkter" "Produkt Alpha" "generic placeholder leak" || ok=1
does_not_contain "$SOL/da" "data-first-run-welcome" "first-run welcome canvas" || ok=1
crawl_internal_links "$SOL" "Solbrillen" || ok=1
if [ $ok -eq 0 ]; then echo "  ✅ Solbrillen OK"; PASS=$((PASS+1)); else echo "  ❌ Solbrillen FAILED"; FAIL=$((FAIL+1)); fi
echo

# ─── Summary ──────────────────────────────────────────────────────────────
echo "─────────────────────────────────────────"
echo "Passed: $PASS / 3   Failed: $FAIL / 3"
exit $FAIL
