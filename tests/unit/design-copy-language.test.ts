import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

import { createTranslator } from "next-intl";

import { describe, expect, it } from "vitest";

/**
 * A design pack renders for EVERY locale a shop serves, so a Danish string
 * literal in a pack's render path is a bug by construction: it is served
 * verbatim on /en. Measured 2026-08-28 — `designs/aurora-shop/homepage.tsx`,
 * the DEFAULT pack for every webshop scaffold (`designs/options.ts`
 * `inferDesignFromIndustry` → "aurora-shop"), shipped a Danish USP row, so
 * every English `create-cartwright` shop rendered "Derfor handler du trygt hos
 * os" on its homepage.
 *
 * Scope is the RENDER entry points (homepage/chrome). Section `*Defaults`
 * exports are a different mechanism — governed DATA persisted into
 * `Page.layoutJson` when a section is inserted — and need their own fix.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Danish letters, plus words with no English reading. Both are needed: "Hurtig
// levering" has no special characters, "Nøje" is not caught by a word list.
const DA_LETTERS = /[æøåÆØÅ]/;
// Case-SENSITIVE and place-name aware. This list used to be case-insensitive
// with no proper-noun exemption, which made it reject perfectly good English:
// "AF Logistics", "Aarhus studio", "VED certified" all tripped it. A guard
// that fails on valid copy is worse than no guard, because it gets switched
// off — so the two rules stay: lowercase-only words, place names exempt.
// Widened 2026-08-29 after a mutation exposed the gap: "Din overskrift her"
// — the registry's own default headline — carries no æøå and matched nothing
// on the original list, so the guard passed on it. Every word added has no
// English reading; "her", "kom" and "gang" are deliberately NOT here for
// exactly that reason.
const DA_WORDS =
  /\b(og|ikke|hvis|vores|som|der|ved|kun|hver|inden|af|fra|eller|kan|skal|det|hos|dig|levering\w*|betaling\w*|handler|trygt|udvalgt\w*|hurtig|sikker|vælger|kunderne|hverdage|påkrævet|kvalitet|fokus|din|dine|jeres|overskrift|undertitel|beskriver|tilbyder|sætning|indsæt|inspektoren|genereret|opdateret|betalingsmetoder|returnere|fortryder|leveringstid|siger|opsætning|indstillinger)\b/;
const DA_PROPER_NOUNS =
  /\b(København|Københavns|Aarhus|Århus|Odense|Ålborg|Aalborg|Nørrebro|Vesterbro|Østerbro|Amager|Sjælland|Fyn|Jylland|Møn|Læsø|Bornholm|Søborg|Solbrillen|Nørre\w*|Søndre\w*|Østre\w*|Vestre\w*)\b/g;

function isDanish(value: string): boolean {
  return (
    DA_LETTERS.test(value.replace(DA_PROPER_NOUNS, "")) || DA_WORDS.test(value)
  );
}

/**
 * LOCALE-GATED, dated 2026-08-28 — present but NOT leaking.
 *
 * These files hold their Danish inside an `en ? {…} : {…}` dictionary or a
 * `locale === "en" ? … : …` ternary, so /en already renders English. They are
 * listed because the scan cannot see a ternary, and delisting them silently
 * would let a genuinely hardcoded string slip in beside them.
 *
 * Not a leak, but still debt: an inline dictionary is a second translation
 * system beside messages/{da,en}.json, invisible to /admin/translations and to
 * anyone adding a third locale. Convert when the file is touched for other
 * reasons — never as a drive-by, since the current behaviour is correct.
 */
const LOCALE_GATED_DANISH = new Map<string, Set<string>>([
  [
    "designs/agentic-showcase/homepage.tsx",
    new Set([
      "Beviser før løfter",
      "Cartwright adskiller discovery fra autoritet. Agenter kan undersøge offentlig information med det samme, mens kundedata, ordrer, checkout-state, administration og writes kræver eksplicitte scopes.",
      "Cartwright leverer semantiske, server-renderede sider til mennesker og softwareagenter. Denne lette profil eksponerer kun det offentlige web-lag og annoncerer ingen agent-API eller administrativ handlingsflade.",
      "Cartwright leverer semantiske, server-renderede sider til mennesker og typed, styrede interfaces til softwareagenter. Offentlig browsing er anonym og read-only. Private data og alle handlinger forbliver bag scoped API-nøgler.",
      "Denne profil eksponerer kun offentligt webindhold. Den indeholder ingen kunde-, ordre-, checkout-, administrations- eller programmatisk write-overflade.",
      "Det kørende site eksponerer dokumentation, du kan kontrollere direkte. En ekstern score offentliggøres først, når den uafhængige rapport er opdateret.",
      "Et site agenter kan forstå, før de klikker.",
      "Hvert interface fortæller, hvad der er offentligt, hvad der kræver autoritet, og hvordan en klient kommer videre efter fejl.",
      "Inspicér det kørende site",
      "Live, afgrænsede kontrakter",
      "Læs om sitet",
      "Læs udviklerdocs",
      "Mennesker får en hurtig og tilgængelig brugerflade. Agenter får de samme offentlige fakta gennem eksplicitte kontrakter i stedet for at scrape skrøbelig UI-state.",
      "Mennesker og agenter modtager de samme semantiske, server-renderede offentlige sider. Valgfrie programmatiske interfaces udelades i stedet for at blive annonceret som placeholders.",
      "Scaffold et let offentligt site med SSR, structured data, trust-sider og forudsigelig recovery, og tilføj først styrede agentinterfaces, når projektet har brug for dem.",
      "Scaffold et rigtigt site eller en shop med SSR, structured data, developer discovery og en styret agentoverflade, der allerede hænger sammen.",
      "Start med det samme fundament",
      "Svarene hentes fra denne deployment – de er ikke kopieret ind i en marketing-mockup.",
      "Uafhængig scoreverifikation afventer",
      "Ét indholdssystem. To førsteklasses læsere.",
    ]),
  ],
  [
    "components/AIStylistPanel.tsx",
    new Set([
      "AI-assistenten tænker...",
      // Was NOT gated until 2026-08-29: ToolResultRenderer had no `en` binding
      // while the rest of the file did, so three strings rendered Danish on
      // every English shop with the default-on aiStylist. Now behind the same
      // `en ? … : …` the file uses everywhere else.
      //
      // That they survived here says something about this scan, and the note
      // is deliberate: the JSX-text pattern is `>([^<>{}\n]{6,})<`, so text
      // containing an interpolation is invisible — which hid two of the three
      // ("Seneste leveringsadresse: {…}", "✓ Lagt i kurven: {…}"). The third,
      // "✓ Velkommen tilbage!", was visible but carries no æøå and no word on
      // the list, so isDanish() returned false. Only this one trips the scan,
      // via `levering\w*`; the other two are listed nowhere because the
      // scanner still cannot produce them.
      "Seneste leveringsadresse: ",
      "Ingen produkter matchede. Prøv en bredere søgning.",
      "Konsulenten kan booke møder, finde cases og rådgive om teknologi.",
      "På lager",
      "Salg & Rådgivning",
      "Spørg konsulenten om...",
      "Webshop løsninger",
    ]),
  ],
  [
    "components/ConsentBanner.tsx",
    new Set([
      "Nødvendige",
      "Nødvendige cookies er altid aktive (login, kurv, sikkerhed). Analyse-cookies hjælper os med at forstå hvordan siden bruges. Marketing-cookies bruges til at vise relevant indhold.",
      "Personliserede annoncer (når aktiveret af shoppen).",
    ]),
  ],
  [
    "components/SmartContactForm.tsx",
    new Set([
      "Tak for din besked!",
      // Moved here 2026-08-29: these two were prose in
      // app/api/contact/upload/route.ts, so the SERVER's language won over the
      // visitor's. They now live in this component's own `en ? … : …` copy
      // dictionary, which is the same locale-gated shape as its neighbours.
      "Kun billeder (JPEG, PNG, WebP) kan vedhæftes.",
      "Filens indhold matcher ikke filtypen.",
      "AI læser din besked...",
      "Fik du svar på dit spørgsmål?",
      "Hvad drejer det sig om?",
      "Ja, tak for hjælpen",
      "Kunne ikke oprette forbindelse til serveren",
      "Noget gik galt. Prøv igen.",
      "Produktspørgsmål",
      "Skriv til os herunder. Vores AI forsøger at svare dig med det samme - ellers sender vi det videre til vores support team.",
      "Skriv venligst lidt mere, så vi kan hjælpe dig bedst muligt.",
      "Spørg kundeservice",
      "Vedhæft billeder (valgfrit, maks 3)",
      "Vi har modtaget din henvendelse og vender tilbage hurtigst muligt (oftest indenfor 24 timer).",
    ]),
  ]
]);

/**
 * REAL DEBT, dated 2026-08-28 — Danish that renders in EVERY locale.
 *
 * Neither pack is the default (`inferDesignFromIndustry` returns aurora-*), so
 * these ship only to a shop that opts into them — which is why they are
 * recorded rather than fixed here. Listing the exact literals, not the files,
 * keeps the rest of each file under the guard: this can only shrink.
 */
const UNTRANSLATED_DANISH = new Map<string, Set<string>>([
  // EMPTY, and that is the point: every string that rendered Danish in an
  // English locale has been routed through messages/{da,en}.json. An entry
  // appearing here again is a regression, not a backlog item.
]);

/** Every listed string, whichever bucket it is in. */
const KNOWN_DANISH_LITERALS = new Map<string, Set<string>>([
  ...LOCALE_GATED_DANISH,
  ...UNTRANSLATED_DANISH,
]);

/**
 * Every piece of user-visible text in a pack: quoted string literals AND JSX
 * text children. Literals alone were not enough — measured, a plain
 * `<h2>Derfor handler du trygt hos os</h2>` sailed past the guard, which is
 * the most natural way to hardcode copy in the first place.
 */
function visibleText(src: string): { line: number; value: string }[] {
  const out: { line: number; value: string }[] = [];
  // JSX comments span lines and their continuations start with neither `//`
  // nor `*`, so a per-line prefix test walks straight into them — measured:
  // a line of `components/Footer.tsx` documenting the copy it REPLACED was
  // reported as shipping that copy. Blanked before anything is scanned, with
  // newlines preserved so reported line numbers stay true.
  const scrubbed = src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  scrubbed.split("\n").forEach((raw, idx) => {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return;
    for (const m of raw.matchAll(/"([^"\n]{6,})"|'([^'\n]{6,})'/g)) {
      const value = m[1] ?? m[2] ?? "";
      // Paths, imports, class names and tokens are not prose.
      if (/^(https?:|\/|@\/|\.|#)/.test(value)) continue;
      if (!value.includes(" ") && value.includes("-")) continue;
      out.push({ line: idx + 1, value });
    }
    // JSX text children: `>text<` on one line, and bare prose lines between
    // tags. Skip anything that still looks like markup or an expression.
    for (const m of raw.matchAll(/>([^<>{}\n]{6,})</g)) {
      const value = (m[1] ?? "").trim();
      if (value.length >= 6) out.push({ line: idx + 1, value });
    }
  });
  return out;
}

describe("design packs render no hardcoded Danish", () => {
  const entryPoints = [
    ...globSync("designs/*/{homepage,chrome}.tsx", { cwd: repoRoot }),
    // Sections joined the scope on 2026-08-29. The docblock above used to say
    // they were "a different mechanism … and need their own fix" — they were,
    // and it landed: `defaultProps` are cloned into the page by
    // `VisualBuilderClient.tsx:165` and persisted, so Danish placeholder copy
    // became Danish rows in an English shop's database. 57 strings were
    // translated; the scope now guards the result.
    ...globSync("designs/*/sections/*.tsx", { cwd: repoRoot }),
    ...globSync("lib/builder/section-registry.tsx", { cwd: repoRoot }),
    // Shared storefront components ship to every scaffold too, and the same
    // defect lived there: PaymentMethodMarks hardcoded Danish that
    // messages/da.json already carried, and AIStylistButton's website-mode
    // fallback was two Danish literals. The admin is excluded — it is
    // English-only by design and holds no next-intl context.
    ...globSync("components/**/*.tsx", { cwd: repoRoot }).filter(
      (f) => !f.startsWith("components/admin/"),
    ),
  ];

  it("finds the render entry points at all", () => {
    // A glob that silently matches nothing would make every assertion below
    // vacuously true — the exact failure mode this file guards against.
    expect(entryPoints.length).toBeGreaterThan(50);
    expect(entryPoints).toContain("designs/aurora-shop/homepage.tsx");
    expect(entryPoints).toContain("components/Footer.tsx");
  });

  it.each(entryPoints)("%s", (file) => {
    const debt = KNOWN_DANISH_LITERALS.get(file) ?? new Set<string>();
    const offenders = visibleText(
      readFileSync(`${repoRoot}${file}`, "utf8"),
    ).filter((l) => isDanish(l.value) && !debt.has(l.value));

    expect(
      offenders.map((o) => `:${o.line} ${o.value}`),
      `${file} ships Danish copy — route it through messages/{da,en}.json + t() ` +
        "instead (da stays byte-identical, en gets the translation)",
    ).toEqual([]);
    },
  );

  it("every listed literal is still actually in its file", () => {
    // A stale entry silently exempts a string that is already gone — and would
    // then exempt it again if someone re-introduced it somewhere else.
    for (const [file, debt] of KNOWN_DANISH_LITERALS) {
      const present = new Set(
        visibleText(readFileSync(`${repoRoot}${file}`, "utf8")).map((l) => l.value),
      );
      for (const literal of debt) {
        expect(
          present.has(literal),
          `${file} no longer contains ${JSON.stringify(literal)} — remove it from KNOWN_DANISH_LITERALS`,
        ).toBe(true);
      }
    }
  });
});

/**
 * The keys the default pack now reads. `t()` returning a missing key renders
 * the key itself, so "it compiles" proves nothing — both catalogues have to
 * carry every key, `da` has to be BYTE-IDENTICAL to the literals that were
 * removed (that is what keeps /da on the canaries unchanged), and `en` has to
 * be actual English.
 */
const DA_BEFORE_EXTRA: Record<string, string> = {
  // The website-mode assistant fallback, which lived as two literals in
  // components/AIStylistButton.tsx and put Danish on every English
  // website-mode scaffold — Teloz's own /en included.
  consultantLabel: "AI Konsulent",
  consultantOpenText: "Spørg AI Konsulenten",
};

const USP_DA_BEFORE: Record<string, string> = {
  uspTitle: "Derfor handler du trygt hos os",
  uspShippingTitle: "Hurtig levering",
  uspShippingBody: "Afsendt hurtigt — direkte til din dør.",
  uspPaymentTitle: "Sikker betaling",
  uspPaymentBody: "Krypteret checkout og køberbeskyttelse.",
  uspQualityTitle: "Kvalitet i fokus",
  uspQualityBody: "Nøje udvalgte produkter, vi selv står inde for.",
};

describe("the extracted USP copy survives the move", () => {
  const load = (locale: string) =>
    JSON.parse(readFileSync(`${repoRoot}messages/${locale}.json`, "utf8"));

  it("da is byte-identical to the literals that were removed", () => {
    const da = load("da").Storefront;
    for (const [key, before] of Object.entries({
      ...USP_DA_BEFORE,
      ...DA_BEFORE_EXTRA,
    })) {
      expect(da[key], `Storefront.${key} drifted — /da would change on the canaries`).toBe(
        before,
      );
    }
  });

  it("en carries every key, in English", () => {
    const en = load("en").Storefront;
    for (const key of Object.keys({ ...USP_DA_BEFORE, ...DA_BEFORE_EXTRA })) {
      const value = en[key];
      expect(typeof value, `messages/en.json is missing Storefront.${key}`).toBe("string");
      expect(value.length).toBeGreaterThan(3);
      expect(value, `Storefront.${key} is not English`).not.toMatch(DA_LETTERS);
      expect(value, `Storefront.${key} is not English`).not.toMatch(DA_WORDS);
      expect(value, `Storefront.${key} was never translated`).not.toBe(
        { ...USP_DA_BEFORE, ...DA_BEFORE_EXTRA }[key],
      );
    }
  });

  it("the payment row's chrome is in both catalogues too", () => {
    for (const locale of ["da", "en"]) {
      const tb = load(locale).TrustBadges;
      expect(typeof tb.securePayment, `${locale}: TrustBadges.securePayment`).toBe("string");
      expect(typeof tb.paymentMethodsAria, `${locale}: TrustBadges.paymentMethodsAria`).toBe(
        "string",
      );
    }
    expect(load("en").TrustBadges.paymentMethodsAria).not.toMatch(DA_WORDS);
  });
});

/**
 * The byte-identity claim rests on next-intl returning these strings unchanged,
 * and "the JSON value equals the old literal" is not by itself proof that the
 * RENDERED string does — messages go through an ICU parser. So this runs the
 * REAL translator over the REAL catalogue and compares its OUTPUT, which is
 * what /da actually serves.
 *
 * Measured on this version rather than assumed: `'`, `{`, `}` and `#` all pass
 * through unchanged when a message has no ICU arguments. That is why there is
 * no assertion banning those characters — English marketing copy is full of
 * apostrophes, and a guard that rejects "We've got you covered" would be a
 * false positive. The output comparison below catches mangling from ANY cause,
 * including a future parser change, without guessing at the mechanism.
 */
describe("next-intl renders the moved copy verbatim", () => {
  const render = (locale: string, namespace: string) =>
    createTranslator({
      locale,
      messages: JSON.parse(readFileSync(`${repoRoot}messages/${locale}.json`, "utf8")),
      namespace,
    });

  it("da output is identical to the literals that were removed", () => {
    const t = render("da", "Storefront");
    for (const [key, before] of Object.entries({
      ...USP_DA_BEFORE,
      ...DA_BEFORE_EXTRA,
    })) {
      expect(t(key), `Storefront.${key} does not RENDER as the old literal`).toBe(before);
    }
  });

  it("the payment chrome renders verbatim too", () => {
    expect(render("da", "TrustBadges")("securePayment")).toBe("Sikker betaling");
    expect(render("da", "TrustBadges")("paymentMethodsAria")).toBe(
      "Accepterede betalingsmetoder",
    );
  });

  it("en renders too, and differs", () => {
    const tDa = render("da", "Storefront");
    const tEn = render("en", "Storefront");
    for (const key of Object.keys({ ...USP_DA_BEFORE, ...DA_BEFORE_EXTRA })) {
      expect(tEn(key)).not.toBe(tDa(key));
      expect(tEn(key).length).toBeGreaterThan(3);
    }
  });
});

/**
 * Packs whose copy has been fully routed through messages/{da,en}.json.
 *
 * The Danish word list will never be complete — proved three times in one day:
 * "Kvalitet i fokus", "Shop solbriller" and "Uden huslejen." are all Danish
 * with neither æøå nor a listed word, and all three walked past it. So for a
 * pack that HAS been translated, the invariant is not "contains no Danish" but
 * the stronger, language-independent "contains no user-visible copy at all".
 *
 * That is the right rule for a design pack regardless of language: a pack
 * renders in every locale a shop serves, so an English literal is exactly as
 * wrong for a Danish shop as a Danish one is for an English shop — hoptify
 * shipped both directions at once.
 */
const FULLY_TRANSLATED_PACKS = ["designs/hoptify/homepage.tsx"];

describe("a translated pack keeps no copy literals at all", () => {
  it.each(FULLY_TRANSLATED_PACKS)("%s", (file) => {
    // A pruned scaffold does not have every pack. The `light` profile removes
    // hoptify entirely, and a file that is not there cannot carry copy — so
    // this is nothing to assert, not a failure. Stated rather than silent:
    // the engine always has the pack, so a genuine deletion still turns the
    // count assertion below red.
    if (!existsSync(`${repoRoot}${file}`)) return;
    const src = readFileSync(`${repoRoot}${file}`, "utf8");
    const scrubbed = src
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    // JSX text children only: attribute values are class names and alt text,
    // and `alt=""` on a decorative image is correct, not copy.
    const literals = [...scrubbed.matchAll(/>([^<>{}\n]+)</g)]
      .map((m) => m[1].trim())
      .filter((v) => /[A-Za-zÀ-ÿ]{3}/.test(v));
    expect(
      literals,
      `${file} renders literal copy. A pack renders in EVERY locale, so any ` +
        "literal is wrong in at least one of them — route it through t().",
    ).toEqual([]);
  });
});
