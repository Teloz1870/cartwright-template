import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Shared components that render on a locale route must speak the page's
 * language — and every key they name must actually resolve.
 *
 * Two shapes were found here, and they are opposites of the same defect:
 *
 * - `MagicLinkForm` had no i18n at all while its own parent, `LoginForm`, had
 *   three `useTranslations` calls. So a Danish shop's login page was Danish on
 *   the password tab and English on the magic-link tab — the same page, two
 *   languages, because one component was written later than the other.
 * - `plugins/reviews/pages/OrderReviewPage` was the reverse: hardcoded Danish
 *   on a page reachable from any order, on any shop.
 * - The four `components/chrome-parts/*` render on every page of any shop that
 *   selects them, and announced "Explore" / "Primary" / "Footer" to screen
 *   readers regardless of locale.
 *
 * The second assertion is the one that keeps paying: a `t("key")` naming a key
 * that exists in `en.json` but not `da.json` renders the key itself — a raw
 * identifier on the page — and nothing else in the suite would catch it.
 */

const read = (p: string) => readFileSync(p, "utf8");

/** Rendered on a locale route, shared across shops, not a design pack's demo copy. */
const SHARED = [
  "components/MagicLinkForm.tsx",
  "components/chrome-parts/MegaFooter.tsx",
  "components/chrome-parts/CenteredHeader.tsx",
  "components/chrome-parts/MinimalHeader.tsx",
  "components/chrome-parts/SlimFooter.tsx",
].filter(existsSync);

const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));

function bag(locale: string, namespace: string): Record<string, unknown> {
  const parsed = JSON.parse(read(`messages/${locale}`)) as Record<string, unknown>;
  return (parsed[namespace] as Record<string, unknown>) ?? {};
}

/**
 * JSX text nodes, across line breaks.
 *
 * The first version of this check required `>` and `<` on the SAME line, so
 * a mutation putting a Danish heading back on its own line passed. Real JSX
 * copy is almost always on its own line — which is exactly the case it
 * missed.
 */
function jsxTextNodes(src: string): string[] {
  const withoutComments = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    // Two or more words of letters = a sentence someone wrote, not markup
    // punctuation like "·", "→" or a lone "&nbsp;".
    .filter((s) => /(?:[A-Za-zÆØÅæøå]+\s+){1,}[A-Za-zÆØÅæøå]+/.test(s))
    // `>…<` also spans TypeScript generics and expressions, e.g.
    // `setErrorMessage(null); async function handleSubmit(e: React.FormEvent`.
    // Code punctuation is the tell; prose does not carry it.
    .filter((s) => !/[;()=:]/.test(s));
}

/**
 * Sentences inside a JSX EXPRESSION, e.g.
 * `{status === "sending" ? t("magicSending") : "Send me a link"}`.
 *
 * `>…<` stops at the opening brace, so a mutation putting that literal back
 * passed the text-node check. This looks at string literals instead: a
 * capitalised multi-word string that is not an attribute value.
 */
function hardcodedSentences(src: string): string[] {
  return [...src.matchAll(/(\w+=)?"([A-ZÆØÅ][^"\n]{6,})"/g)]
    .filter((m) => !m[1]) // className="…", aria-label="…" are handled above
    .map((m) => m[2])
    .filter((s) => /\s/.test(s))
    // Import paths, type unions and formats are capitalised but not copy.
    .filter((s) => !/[<>{}=;|]/.test(s));
}

describe("shared components follow the page locale", () => {
  it("covers a real surface in a repo that has locale files", () => {
    expect(SHARED.length).toBe(5);
    expect(LOCALES.length).toBeGreaterThan(0);
  });

  it.each(SHARED)("%s reads its copy from next-intl", (file) => {
    const src = read(file);
    expect(src).toMatch(/\b(useTranslations|getTranslations)\("(\w+)"\)/);
  });

  it.each(SHARED)("%s names only keys that resolve in every locale", (file) => {
    const src = read(file);
    const ns = /\b(?:useTranslations|getTranslations)\("(\w+)"\)/.exec(src)?.[1];
    expect(ns, `${file} declares no namespace`).toBeTruthy();

    const keys = [...src.matchAll(/\bt\("(\w+)"\)/g)].map((m) => m[1]);
    // A component in this list that names no keys is either mis-listed or has
    // silently lost its copy — either way the assertion below would be empty.
    expect(keys.length, `${file} uses next-intl but names no keys`).toBeGreaterThan(0);

    for (const locale of LOCALES) {
      const messages = bag(locale, ns!);
      for (const key of keys) {
        const value = messages[key];
        expect(
          typeof value === "string" && value.length > 0,
          `messages/${locale} is missing ${ns}.${key} — the page would render the key itself`,
        ).toBe(true);
      }
    }
  });

  it.each(SHARED)("%s hardcodes no sentence inside an expression", (file) => {
    expect(
      hardcodedSentences(read(file)),
      `${file} has copy in an expression that no locale can change`,
    ).toEqual([]);
  });

  it.each(SHARED)("%s renders no hardcoded sentence", (file) => {
    expect(
      jsxTextNodes(read(file)),
      `${file} has JSX copy that no locale can change`,
    ).toEqual([]);
  });

  it("the review page reachable from an order renders no hardcoded copy", () => {
    const file = "plugins/reviews/pages/OrderReviewPage.tsx";
    if (!existsSync(file)) return; // pruned with the reviews plugin
    const src = read(file);
    // Its copy now lives in the `en ? … : …` dictionary the plugin's other
    // components use, so the JSX should carry none of it.
    expect(src).toMatch(/const en = locale === "en"/);
    // NOT filtered on æøå: "Anmeld produkter fra denne ordre" carries none,
    // and an earlier version of this assertion passed a mutation that put it
    // back for exactly that reason. Any hardcoded sentence fails, whatever
    // language it is in.
    expect(jsxTextNodes(src), "copy no locale can change").toEqual([]);
  });
});

/**
 * ── The assistive layer, and the links the shared chrome hands out ─────────
 *
 * Two blind spots the block above could not see, both measured 2026-08-31 on
 * `origin/main`:
 *
 * 1. ATTRIBUTES. Every check above reads JSX text nodes or string literals in
 *    expressions, and both skip `aria-label="…"` outright. So the layer only a
 *    screen-reader user meets had no gate at all — and it had drifted in BOTH
 *    directions at once. `VoiceShopButton` announced `aria-label="Start
 *    voice-shopping"` (English) next to `<span class="sr-only">Snak med …`
 *    (Danish) on the same button; `VoiceShopOverlay` opened a dialog labelled
 *    "Voice shop" whose close button said "Luk voice shop".
 *
 * 2. LINKS. `components/AIStylistPanel.tsx`, `LoginForm.tsx`,
 *    `first-run/WelcomeCanvas.tsx` and `shared/PlanCard.tsx` imported plain
 *    `next/link` and handed out `/cart`, `/checkout`, `/order/<id>`,
 *    `/account/forgot-password`, `/built-with-cartwright` and `/info/returns` —
 *    every one of them a route that only exists under `app/[locale]`. A shopper
 *    reading /en who followed one landed back in the shop's default locale.
 *    This is the fourth recurrence of that defect class (#464 header drawer,
 *    #469 footer, F8 in the packs), so it gets a gate rather than a fifth fix.
 *
 * The segment list is DERIVED from `app/[locale]` rather than written out, so
 * a new locale route is covered the day it is added — and a segment that also
 * exists at the app root (`/llms.txt`, `/blog`) is excluded, because an
 * unprefixed link to those is correct.
 */

const ASSISTIVE = [
  "components/NewsletterSignup.tsx",
  "components/CurrencySwitcher.tsx",
  "components/LoginForm.tsx",
  "components/voice/VoiceShopButton.tsx",
  "components/voice/VoiceShopOverlay.tsx",
].filter(existsSync);

/**
 * An attribute value is COPY unless it reads as a token: `you@example.com`,
 * `image/png`, `/produkter`. Requiring two words instead would have passed
 * `aria-label="Currency"`, which is exactly one of the strings this found.
 */
function hardcodedAttributeCopy(src: string): string[] {
  return [...src.matchAll(/\b(?:aria-label|placeholder|title)="([^"\n]+)"/g)]
    .map((m) => m[1])
    .filter((v) => /[A-Za-zÆØÅæøå]/.test(v))
    .filter((v) => /\s/.test(v) || !/[@./]/.test(v));
}

/**
 * `jsxTextNodes` with the two-word requirement DROPPED.
 *
 * Two reviewers found the same hole independently: `Bekræftelse`, `Ja`, `Nej`
 * and `Luk` — four of the twelve strings this change converted in
 * `VoiceShopOverlay` — are single words, so reverting all four left the suite
 * green. The word count exists in the original helper to avoid flagging markup
 * punctuation on the wider SHARED list; the code-punctuation filter already
 * does that job, so the files below hold the stricter rule.
 */
function anyJsxTextCopy(src: string): string[] {
  const withoutComments = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    // Entities are decoded away BEFORE the punctuation filter: `&ldquo;` and
    // `&nbsp;` each carry a `;`, so prose containing one was dropped whole —
    // including `Sig &ldquo;ja&rdquo; …`, one of the strings converted here.
    .map((v) => v.replace(/&[a-z0-9#]+;/gi, ""))
    .filter((v) => /[A-Za-zÆØÅæøå]/.test(v))
    .filter((v) => !/[;()=:]/.test(v));
}

/** `<span className="sr-only">Currency</span>` — one word, so no text-node check sees it. */
function hardcodedSrOnly(src: string): string[] {
  return [...src.matchAll(/className="[^"]*\bsr-only\b[^"]*"[^>]*>([^<>{}]+)</g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((v) => /[A-Za-zÆØÅæøå]/.test(v));
}

describe("the assistive layer follows the page locale", () => {
  it("covers a real surface", () => {
    // Not a pinned 5: `scaffold/manifest.json` claims `components/voice` for
    // the `voice` module and `components/LoginForm.tsx` for `auth`, so an
    // exact count is one entry in the CLI's prune list away from a false red
    // in a customer scaffold — the R1/R2 defect class. (Measured: today's
    // LIGHT_EXCLUDED_PATHS prunes neither, so nothing is red now.)
    expect(ASSISTIVE.length).toBeGreaterThanOrEqual(3);
  });

  it.each(ASSISTIVE)("%s hardcodes no aria-label/placeholder/title copy", (file) => {
    expect(
      hardcodedAttributeCopy(read(file)),
      `${file} announces copy no locale can change`,
    ).toEqual([]);
  });

  it.each(ASSISTIVE)("%s hardcodes no sr-only copy", (file) => {
    expect(hardcodedSrOnly(read(file)), `${file} has sr-only copy no locale can change`).toEqual([]);
  });

  /**
   * The visible half, for the files that are fully converted.
   *
   * `LoginForm` is excluded from BOTH: it still renders "Continue with
   * GitHub", "Continue with Google", "Magic link" and "Your account has been
   * created. Log in", and its `devHint` branch logs four English strings that
   * a text scan cannot tell from copy. Listing it here would mean listing four
   * exemptions; the four strings are a backlog line instead.
   *
   * `NewsletterSignup` is excluded from the EXPRESSION check only, and for the
   * opposite reason: the literals it still carries are deliberately English
   * and must stay that way — the `respondWith` outcomes an AI agent reads
   * ("Subscription failed — the store had a temporary error.") and the WebMCP
   * `tooldescription`/`toolparamdescription` pair, which is published tool
   * metadata. Its one rendered expression, the submit label, is pinned at the
   * RENDER level in `newsletter-a11y.test.tsx` instead, which needs no
   * exemptions at all.
   */
  const ASSISTIVE_NO_TEXT_NODES = ASSISTIVE.filter((f) => f !== "components/LoginForm.tsx");
  const ASSISTIVE_NO_EXPRESSIONS = ASSISTIVE_NO_TEXT_NODES.filter(
    (f) => f !== "components/NewsletterSignup.tsx",
  );

  it("still covers the files it claims to", () => {
    // The INVARIANT, not the arithmetic: subtracting a fixed count breaks the
    // moment one of the excluded files is itself pruned.
    expect(ASSISTIVE_NO_TEXT_NODES).not.toContain("components/LoginForm.tsx");
    expect(ASSISTIVE_NO_EXPRESSIONS).not.toContain("components/NewsletterSignup.tsx");
    expect(ASSISTIVE_NO_EXPRESSIONS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(ASSISTIVE_NO_TEXT_NODES)("%s renders no hardcoded copy at all", (file) => {
    expect(anyJsxTextCopy(read(file)), `${file} has JSX copy that no locale can change`).toEqual([]);
  });

  it.each(ASSISTIVE_NO_EXPRESSIONS)("%s hardcodes no sentence in an expression", (file) => {
    expect(
      hardcodedSentences(read(file)),
      `${file} has copy in an expression that no locale can change`,
    ).toEqual([]);
  });

  /**
   * The same key-resolution check the SHARED block runs — a `t("key")` that
   * resolves in one locale file and not the other renders the raw identifier
   * on the page, and nothing else in the suite would see it.
   *
   * The key pattern allows a second argument: `t("voiceTalkTo", { assistant })`
   * is invisible to the `\bt\("(\w+)"\)` form the SHARED block uses.
   */
  it.each(ASSISTIVE)("%s names only keys that resolve in every locale", (file) => {
    const src = read(file);
    const ns = /\b(?:useTranslations|getTranslations)\("(\w+)"\)/.exec(src)?.[1];
    expect(ns, `${file} declares no namespace`).toBeTruthy();
    const keys = [...src.matchAll(/\bt\("(\w+)"[,)]/g)].map((m) => m[1]);
    expect(keys.length, `${file} uses next-intl but names no keys`).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      const messages = bag(locale, ns!);
      for (const key of keys) {
        expect(
          typeof messages[key] === "string" && (messages[key] as string).length > 0,
          `messages/${locale} is missing ${ns}.${key} — the page would render the key itself`,
        ).toBe(true);
      }
    }
  });
});

/** Static top-level routes that exist ONLY under `app/[locale]`. */
function localeOnlySegments(): string[] {
  return readdirSync("app/[locale]", { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .filter((name) => !existsSync(`app/${name}`));
}

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    // The admin tree is NOT locale-routed — `/admin/...` links are correct
    // there, and it has no NextIntlClientProvider at all.
    if (entry.isDirectory()) {
      if (entry.name === "admin") continue;
      out.push(...tsxFilesUnder(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** The JSX tag that owns the `href=` at `index` — the nearest opener before it. */
function owningTag(src: string, index: number): string {
  const open = src.lastIndexOf("<", index);
  return /^<\/?([A-Za-z][\w.]*)/.exec(src.slice(open, open + 40))?.[1] ?? "";
}

/** Every bare locale-route link `src` hands out, as reported strings. */
function bareLocaleLinks(file: string, src: string, segments: string[]): string[] {
  const offenders: string[] = [];
  // next-intl's `Link` prefixes the active locale itself, so a file that
  // imports it may write bare hrefs on Link-like elements. The exemption is
  // narrow but not airtight: a non-locale-aware `FooLink` in a file that
  // imports the routing `Link` anywhere would be exempt too. Every href it
  // allows today was enumerated and is genuinely locale-aware (`NavLink`
  // wraps the routing `Link`).
  // Quote style and import specifier both vary: `i18n/routing.ts` and
  // `proxy.ts` are written in single quotes, and a scaffold may import the
  // module relatively. Pinning `from "@/i18n/routing"` reported EIGHT correct
  // MobileMenu links as offenders the moment the quotes changed — a false red
  // in the forks this test ships to, which is worse than the hole it guards.
  const localeAwareLink =
    /import \{[^}]*\bLink\b[^}]*\} from ['"][^'"]*i18n\/routing['"]/.test(src);
  // BOTH literal and template hrefs. A first cut read only `href="/…"`, and
  // the very link this change fixed — `href={`/order/${orderId}`}` — would
  // have slipped straight back in, because its regression form is a template
  // literal, not a quoted string. A CORRECT template starts `/${locale}`, so
  // requiring a letter after the slash separates them.
  //
  // Any attribute NAMED *href counts, not just `href`: `PlanCard` takes its
  // returns link as `returnsHref`, so the prop the storefront passes is
  // covered by the same rule as the attribute it ends up on.
  //
  // The tail is `[^…]*`, NOT `(\/[^…]*)?`: requiring a slash after the segment
  // meant `href="/cart?utm=1"` and `href="/checkout#payment"` — ordinary nav
  // and checkout links — matched nothing at all.
  const bare = [
    ...src.matchAll(/\b(\w*[Hh]ref)="\/([a-z0-9-]+)([^"]*)"/g),
    ...src.matchAll(/\b(\w*[Hh]ref)=\{`\/([a-z0-9-]+)([^`]*)`/g),
    // `href={"/cart"}` / `href={'/cart'}` — Prettier normally rewrites these
    // away, but both were live dodges until they were added here. Only the
    // double-quoted one was covered on the first pass.
    ...src.matchAll(/\b(\w*[Hh]ref)=\{"\/([a-z0-9-]+)([^"]*)"\}/g),
    ...src.matchAll(/\b(\w*[Hh]ref)=\{'\/([a-z0-9-]+)([^']*)'\}/g),
  ];
  for (const match of bare) {
    if (!segments.includes(match[2])) continue;
    const tag = owningTag(src, match.index!);
    // next-intl's Link prefixes for you — but only on a Link. A plain
    // `<a href="/cart">` in the same file is still wrong.
    const viaLink = /Link$/.test(tag) && localeAwareLink;
    if (!viaLink) offenders.push(`${file}: <${tag} ${match[1]}=/${match[2]}${match[3] ?? ""}>`);
  }
  return offenders;
}

describe("shared components link into the reader's locale", () => {
  const SEGMENTS = localeOnlySegments();
  const FILES = tsxFilesUnder("components");

  /**
   * Non-vacuity, proved WITHOUT naming a route.
   *
   * The first cut asserted the segment list contained "cart"/"checkout"/
   * "produkter" — which `modules/registry.ts` claims for the `commerce`
   * module, so every website-mode and `--profile site` scaffold prunes them
   * and this test would have gone red in exactly the forks it ships to. That
   * is the release-blocker class R1/R2 belonged to. A synthetic source proves
   * the detector fires on any fork, pruned or not.
   */
  it("the detector actually fires", () => {
    expect(SEGMENTS.length).toBeGreaterThan(0);
    expect(FILES.length).toBeGreaterThan(20);
    const seg = SEGMENTS[0];
    const fired = bareLocaleLinks("synthetic.tsx", `<a href="/${seg}">x</a>`, SEGMENTS);
    expect(fired.length, "the bare-link detector matched nothing on a bare link").toBe(1);
    const quiet = bareLocaleLinks("synthetic.tsx", "<a href={`/${locale}/" + seg + '`}>x</a>', SEGMENTS);
    expect(quiet, "a correctly prefixed link was reported").toEqual([]);
  });

  it("never hands out a locale route without the locale", () => {
    const offenders = FILES.flatMap((file) => bareLocaleLinks(file, read(file), SEGMENTS));
    expect(
      offenders,
      "these render on a locale route but link out of it — the reader lands in the shop's default language",
    ).toEqual([]);
  });
});
