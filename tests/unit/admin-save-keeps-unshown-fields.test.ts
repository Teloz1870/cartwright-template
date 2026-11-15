import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An admin form saves only the fields it shows. updatePage has two callers and
 * each lacks a field the other has: the page form in /admin/sider has no
 * vibeHtml, yet its save wrote vibeHtml: null — wiping the homepage's
 * mockup.set / Vibe Sandbox takeover; the Vibe Sandbox has no heroImage, yet
 * its save wrote heroImage: null. The service form in /admin/services has no
 * translations field, yet its save wrote translations: null — which Prisma 7 on
 * libSQL stores as JSON null rather than refusing (measured against the
 * generated client), wiping the English copy made in /admin/translations.
 *
 * The fixtures below post exactly the field names their component posts; the
 * first describe reads the components' source so a form that gains or loses a
 * field fails here instead of leaving a fixture that no longer means what its
 * label says.
 *
 * prisma is an in-memory row that applies `update` the way Prisma does: a key
 * whose value is `undefined` is left alone, anything else (null included) is
 * written. requireAdmin, revalidatePath, redirect, IndexNow and the tool
 * registry are mocked — nothing here touches a database or the network.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>>,
  prisma: {
    page: { findUnique: vi.fn(), update: vi.fn() },
    service: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({ invokeTool: vi.fn() }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: vi.fn() }));

function applyUpdate(key: string) {
  return async ({ data }: { data: Row }) => {
    const row = mocks.rows[key];
    for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v;
    return row;
  };
}

beforeEach(() => {
  vi.resetModules();
  for (const model of Object.values(mocks.prisma)) for (const fn of Object.values(model)) fn.mockReset();
  mocks.rows = {};
});

const MOCKUP = '<section class="min-h-screen"><h1>The vision</h1></section>';
const HERO = "https://images.example/hero.jpg";

function seedHomePage() {
  mocks.rows.page = {
    id: "home-id",
    slug: "home",
    title: "Home",
    body: "",
    status: "published",
    heroImage: HERO,
    vibeHtml: MOCKUP,
    translations: null,
  };
  mocks.prisma.page.findUnique.mockImplementation(async () => mocks.rows.page);
  mocks.prisma.page.update.mockImplementation(applyUpdate("page"));
}

/** What PageForm (components/admin/PageForm.tsx) posts — its `name=` inputs: no vibeHtml. */
function pageFormSave(heroImage = ""): FormData {
  const fd = new FormData();
  fd.set("translations", JSON.stringify({ en: { title: "Home page", body: "" } }));
  fd.set("slug", "home");
  fd.set("title", "Home page");
  fd.set("body", "");
  fd.set("heroImage", heroImage);
  fd.set("metaTitle", "");
  fd.set("metaDescription", "");
  fd.set("showInNav", "on");
  fd.set("navOrder", "0");
  return fd;
}

/** What the Vibe Sandbox (app/admin/vibe-sandbox/VibeSandboxClient.tsx handleSave) posts: no heroImage. */
function vibeSandboxSave(vibeHtml: string): FormData {
  const fd = new FormData();
  fd.append("title", "Home");
  fd.append("slug", "home");
  fd.append("body", "Vibe Page Layout");
  fd.append("vibeHtml", vibeHtml);
  fd.append("metaTitle", "");
  fd.append("metaDescription", "");
  fd.append("showInNav", "on");
  fd.append("navOrder", "0");
  fd.append("translations", JSON.stringify({ en: { title: "Home", body: "Vibe Page Layout", vibeHtml: "" } }));
  return fd;
}

/** What ServiceForm (components/admin/ServiceForm.tsx) posts: no translations field. */
function serviceFormSave(): FormData {
  const fd = new FormData();
  fd.append("title", "Domæneflytning");
  fd.append("slug", "domaeneflytning");
  fd.append("shortDescription", "Flyttet på en dag");
  fd.append("priceString", "");
  fd.append("heroImage", "");
  fd.append("body", "Lang tekst");
  fd.append("showInNav", "on");
  fd.append("navOrder", "0");
  fd.append("features", JSON.stringify(["DNS"]));
  return fd;
}

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const names = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]).sort();
const keys = (fd: FormData) => [...new Set(fd.keys())].sort();

describe("the fixtures post the field names their forms post", () => {
  it("PageForm", () => {
    expect(keys(pageFormSave())).toEqual(names(source("components/admin/PageForm.tsx"), /\bname="([^"]+)"/g));
  });

  it("Vibe Sandbox", () => {
    const src = source("app/admin/vibe-sandbox/VibeSandboxClient.tsx");
    expect(keys(vibeSandboxSave(""))).toEqual(names(src, /formData\.append\("([^"]+)"/g));
  });

  it("ServiceForm", () => {
    const src = source("components/admin/ServiceForm.tsx");
    expect(keys(serviceFormSave())).toEqual(names(src, /formData\.append\("([^"]+)"/g));
  });
});

describe("updatePage keeps the vibeHtml and heroImage its form does not show", () => {
  it("a save from the page form leaves the homepage mockup in place", async () => {
    seedHomePage();
    const { updatePage } = await import("@/app/admin/actions");
    expect(await updatePage("home-id", pageFormSave(HERO))).toEqual({ ok: true });
    expect(mocks.rows.page.title).toBe("Home page");
    expect(mocks.rows.page.vibeHtml).toBe(MOCKUP);
  });

  it("a save from the Vibe Sandbox still writes the HTML it posts", async () => {
    seedHomePage();
    const { updatePage } = await import("@/app/admin/actions");
    await updatePage("home-id", vibeSandboxSave("<section>New</section>"));
    expect(mocks.rows.page.vibeHtml).toBe("<section>New</section>");
  });

  it("a Vibe Sandbox save with the HTML emptied still clears it", async () => {
    seedHomePage();
    const { updatePage } = await import("@/app/admin/actions");
    await updatePage("home-id", vibeSandboxSave(""));
    expect(mocks.rows.page.vibeHtml).toBeNull();
  });

  it("a save from the Vibe Sandbox leaves the hero image in place", async () => {
    seedHomePage();
    const { updatePage } = await import("@/app/admin/actions");
    expect(await updatePage("home-id", vibeSandboxSave(MOCKUP))).toEqual({ ok: true });
    expect(mocks.rows.page.body).toBe("Vibe Page Layout");
    expect(mocks.rows.page.heroImage).toBe(HERO);
  });

  it("a page-form save still writes the hero image it posts, and clears it when emptied", async () => {
    seedHomePage();
    const { updatePage } = await import("@/app/admin/actions");
    await updatePage("home-id", pageFormSave("https://images.example/new.jpg"));
    expect(mocks.rows.page.heroImage).toBe("https://images.example/new.jpg");
    await updatePage("home-id", pageFormSave("  "));
    expect(mocks.rows.page.heroImage).toBeNull();
  });
});

const SERVICE_EN = { en: { title: "Domain migration", shortDescription: "Moved in a day", body: "Long" } };

function seedService() {
  mocks.rows.service = {
    id: "s1",
    slug: "domaeneflytning",
    title: "Domæneflytning",
    body: "Lang",
    translations: structuredClone(SERVICE_EN),
  };
  mocks.prisma.service.update.mockImplementation(applyUpdate("service"));
}

describe("updateService keeps the translations its form does not show", () => {
  it("a save from the service form leaves the English copy in place", async () => {
    seedService();
    const { updateService } = await import("@/app/admin/services/actions");
    expect(await updateService("s1", serviceFormSave())).toEqual({ ok: true });
    expect(mocks.rows.service.body).toBe("Lang tekst");
    expect(mocks.rows.service.translations).toEqual(SERVICE_EN);
  });

  it("translations a form does post are still written", async () => {
    seedService();
    const { updateService } = await import("@/app/admin/services/actions");
    const fd = serviceFormSave();
    fd.append("translations", JSON.stringify({ en: { title: "Domain move" } }));
    await updateService("s1", fd);
    expect(mocks.rows.service.translations).toEqual({ en: { title: "Domain move" } });
  });

  it("an empty translations field a form posts still clears them", async () => {
    seedService();
    const { updateService } = await import("@/app/admin/services/actions");
    const { Prisma } = await import("@/app/generated/prisma/client");
    const fd = serviceFormSave();
    fd.append("translations", "");
    await updateService("s1", fd);
    expect(mocks.rows.service.translations).toBe(Prisma.JsonNull);
  });

  it.each([
    ["malformed", "{en: not json"],
    ["whitespace-only", "   "],
  ])("a %s translations field a form posts leaves them in place", async (_label, raw) => {
    seedService();
    const { updateService } = await import("@/app/admin/services/actions");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fd = serviceFormSave();
    fd.append("translations", raw);
    expect(await updateService("s1", fd)).toEqual({ ok: true });
    expect(mocks.rows.service.translations).toEqual(SERVICE_EN);
    expect(error).toHaveBeenCalledWith("Could not parse translations JSON", expect.any(SyntaxError));
    error.mockRestore();
  });

  it("a new service from the form leaves translations unset", async () => {
    mocks.prisma.service.create.mockResolvedValue({ id: "s2" });
    const { createService } = await import("@/app/admin/services/actions");
    await createService(serviceFormSave());
    const { data } = mocks.prisma.service.create.mock.calls[0][0];
    expect(data.title).toBe("Domæneflytning");
    expect(data.translations).toBeUndefined();
  });
});
