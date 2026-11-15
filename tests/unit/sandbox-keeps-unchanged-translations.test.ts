import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SANDBOX-KEEPS-UNCHANGED-TRANSLATIONS — a Vibe Sandbox save drops the stored
 * per-locale vibe HTML only when it publishes NEW HTML.
 *
 * /admin/indstillinger → Translate (/api/admin/vibe/translate) stores
 * `de.vibeHtml` / `es.vibeHtml` made from the page's base `vibeHtml`. A later
 * Sandbox save always posts `vibeHtml`; when it posts the stored HTML back
 * unchanged (only the meta title edited) those translations still match it and
 * must stay. When the HTML changed they are stale and go — the same rule
 * mockup.set applies on every publish, which this file pins as unchanged.
 *
 * prisma is an in-memory row that applies `update` the way Prisma does (an
 * `undefined` key is left alone); requireAdmin, revalidatePath, redirect,
 * IndexNow, the tool registry and the audit wrapper are mocked — nothing here
 * touches a database or the network. Locale names are data keys only: the
 * action and the helper never consult brand.locales for this rule.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  prisma: {
    page: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({ invokeTool: vi.fn() }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: vi.fn() }));
vi.mock("@/lib/audit", () => ({ withAudit: (_meta: unknown, fn: () => unknown) => fn() }));

const { updatePage } = await import("@/app/admin/actions");
const { setMockup, clearMockup } = await import("@/lib/tools/mockup");

const DESIGN = '<section class="min-h-screen"><h1>Velkommen</h1></section>';
const STORED = {
  en: { title: "Home", body: "Vibe Page Layout", vibeHtml: '<section class="min-h-screen"><h1>Welcome</h1></section>' },
  de: { vibeHtml: '<section class="min-h-screen"><h1>Willkommen</h1></section>' },
  es: { title: "Inicio", vibeHtml: '<section class="min-h-screen"><h1>Bienvenido</h1></section>' },
};

beforeEach(() => {
  for (const fn of Object.values(mocks.prisma.page)) fn.mockReset();
  mocks.row = {
    id: "home-id",
    slug: "home",
    title: "Home",
    body: "Vibe Page Layout",
    status: "published",
    vibeHtml: DESIGN,
    translations: structuredClone(STORED),
  };
  mocks.prisma.page.findUnique.mockImplementation(async () => mocks.row);
  mocks.prisma.page.update.mockImplementation(async ({ data }: { data: Row }) => {
    for (const [k, v] of Object.entries(data)) if (v !== undefined) mocks.row[k] = v;
    return mocks.row;
  });
});

/** What the Vibe Sandbox (VibeSandboxClient.tsx handleSave) posts; the English tab round-trips what it loaded. */
function sandboxSave(vibeHtml: string, metaTitle = ""): FormData {
  const fd = new FormData();
  fd.append("title", "Home");
  fd.append("slug", "home");
  fd.append("body", "Vibe Page Layout");
  fd.append("vibeHtml", vibeHtml);
  fd.append("metaTitle", metaTitle);
  fd.append("metaDescription", "");
  fd.append("showInNav", "on");
  fd.append("navOrder", "0");
  fd.append("translations", JSON.stringify({ en: STORED.en }));
  return fd;
}

describe("a Vibe Sandbox save keeps translated vibe HTML when the HTML did not change", () => {
  it("unchanged HTML, new meta title: de/es vibe HTML stay, the meta title lands", async () => {
    expect(await updatePage("home-id", sandboxSave(DESIGN, "Velkommen hjem"))).toEqual({ ok: true });
    expect(mocks.row.metaTitle).toBe("Velkommen hjem");
    expect(mocks.row.vibeHtml).toBe(DESIGN);
    expect(mocks.row.translations).toEqual(STORED);
  });

  it("the comparison reads the stored vibeHtml: the action selects it", async () => {
    await updatePage("home-id", sandboxSave(DESIGN));
    const select = mocks.prisma.page.findUnique.mock.calls[0][0].select;
    expect(select).toMatchObject({ vibeHtml: true, translations: true });
  });

  it("changed HTML: de/es vibe HTML go (they translate the old design), their other fields and the posted English stay", async () => {
    const next = '<section class="min-h-screen"><h1>Nyt design</h1></section>';
    await updatePage("home-id", sandboxSave(next));
    expect(mocks.row.vibeHtml).toBe(next);
    expect(mocks.row.translations).toEqual({ en: STORED.en, de: {}, es: { title: "Inicio" } });
  });

  it("a whitespace-only change counts as changed (exact compare, the conservative side)", async () => {
    await updatePage("home-id", sandboxSave(`${DESIGN}\n`));
    expect(mocks.row.translations).toEqual({ en: STORED.en, de: {}, es: { title: "Inicio" } });
  });

  it("emptying the HTML is a change: the takeover clears and so does its translated vibe HTML", async () => {
    await updatePage("home-id", sandboxSave(""));
    expect(mocks.row.vibeHtml).toBeNull();
    expect(mocks.row.translations).toEqual({ en: STORED.en, de: {}, es: { title: "Inicio" } });
  });

  it("HTML stored with LF survives the multipart round trip (LF -> CRLF) as unchanged", async () => {
    // mockup.set / the API / a seed store LF; the server-action transport is
    // multipart/form-data, which rewrites every lone LF as CRLF. Round-trip the
    // FormData through a real multipart body so the test sees what the action sees.
    const lf = "<section>\n<h1>Velkommen</h1>\n</section>";
    mocks.row.vibeHtml = lf;
    const posted = await new Response(sandboxSave(lf, "Ny titel")).formData();
    expect(posted.get("vibeHtml")).toBe("<section>\r\n<h1>Velkommen</h1>\r\n</section>");
    await updatePage("home-id", posted);
    expect(mocks.row.metaTitle).toBe("Ny titel");
    expect(mocks.row.translations).toEqual(STORED);
  });

  it("a real edit is still a change after line endings are normalised", async () => {
    mocks.row.vibeHtml = "<section>\n<h1>Velkommen</h1>\n</section>";
    await updatePage("home-id", sandboxSave("<section>\r\n<h1>Hej</h1>\r\n</section>"));
    expect(mocks.row.translations).toEqual({ en: STORED.en, de: {}, es: { title: "Inicio" } });
  });

  it("no stored HTML and none posted is no change: stored per-locale vibe HTML is left alone", async () => {
    mocks.row.vibeHtml = null;
    await updatePage("home-id", sandboxSave(""));
    expect(mocks.row.translations).toEqual(STORED);
  });
});

describe("mockup.set is unchanged: every publish wins in every locale", () => {
  it("publishing the very HTML already stored still drops the per-locale vibe HTML", async () => {
    await setMockup.handler({ html: DESIGN, confirm: true }, { actor: "system:test", requestId: "t" });
    expect(mocks.row.vibeHtml).toBe(DESIGN);
    expect(mocks.row.translations).toEqual({
      en: { title: "Home", body: "Vibe Page Layout" },
      de: {},
      es: { title: "Inicio" },
    });
  });
});

describe("mockup.clear is unchanged: clearing a stored takeover drops it in every locale", () => {
  it("clears the base HTML and the per-locale vibe HTML together", async () => {
    await clearMockup.handler({ confirm: true }, { actor: "system:test", requestId: "t" });
    expect(mocks.row.vibeHtml).toBeNull();
    expect(mocks.row.translations).toEqual({
      en: { title: "Home", body: "Vibe Page Layout" },
      de: {},
      es: { title: "Inicio" },
    });
  });
});
