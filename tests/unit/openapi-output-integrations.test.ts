import { describe, expect, it } from "vitest";
import { auditTools } from "@/lib/tools/audit";
import { docsTools } from "@/lib/tools/docs";
import { driveTools } from "@/lib/tools/drive";
import { gdprTools } from "@/lib/tools/gdpr";
import { googleTools } from "@/lib/tools/google";
import { imagesTools } from "@/lib/tools/images";
import { magicTools } from "@/lib/tools/magic";
import { scraperTools } from "@/lib/tools/scraper";
import { sheetsTools } from "@/lib/tools/sheets";
import { uiTools } from "@/lib/tools/ui";
import { zodOutputJsonSchema } from "@/lib/zod-json-schema";

const tools = [
  ...auditTools,
  ...docsTools,
  ...driveTools,
  ...gdprTools,
  ...googleTools,
  ...imagesTools,
  ...magicTools,
  ...scraperTools,
  ...sheetsTools,
  ...uiTools,
];

const ISO = "2026-08-23T12:00:00.000Z";

function outputFor(name: string) {
  const output = tools.find((tool) => tool.name === name)?.output;
  expect(output, `${name} must publish an output schema`).toBeDefined();
  return output!;
}

describe("integration tool output contracts", () => {
  it("publishes a concrete JSON Schema for every integration tool", () => {
    expect(tools).toHaveLength(17);
    for (const tool of tools) {
      expect(tool.output, tool.name).toBeDefined();
      const schema = zodOutputJsonSchema(tool.output);
      expect(schema, tool.name).not.toEqual({});
      expect(Object.keys(schema), tool.name).not.toEqual(["$schema"]);
    }
  });

  it("accepts the serialized audit and import result branches", () => {
    expect(outputFor("audit.list").safeParse([{
      id: "log_1",
      actor: "user:1",
      tool: "products.update",
      ok: true,
      createdAt: ISO,
      errorMsg: null,
      argsJson: "{}",
      beforeJson: null,
      afterJson: "{}",
      requestId: "request_1",
      ip: null,
      userAgent: null,
    }]).success).toBe(true);

    for (const result of [
      {
        ok: true,
        revertedTool: "design.set_layout",
        revertedAuditLogId: "log_1",
        restored: { layoutJson: null },
      },
      {
        ok: true,
        revertedTool: "chrome.set",
        revertedAuditLogId: "log_2",
        restored: { chromeJson: "{}" },
      },
      {
        ok: true,
        revertedTool: "composition.apply",
        revertedAuditLogId: "log_3",
        restored: {
          designSlug: null,
          themeJson: null,
          chromeJson: null,
          threeDConfigJson: null,
          genomeJson: null,
        },
      },
      {
        ok: true,
        revertedTool: "products.delete",
        revertedAuditLogId: "log_4",
        restored: { id: "product_1", slug: "coffee", name: "Coffee" },
      },
    ]) {
      expect(outputFor("audit.revert").safeParse(result).success).toBe(true);
    }

    for (const target of ["page", "post"] as const) {
      expect(outputFor("docs.import").safeParse({
        target,
        id: `${target}_1`,
        slug: "imported-document",
        title: "Imported document",
        adminUrl: `/admin/${target}_1`,
        publicUrl: "/info/imported-document",
      }).success).toBe(true);
    }
  });

  it("accepts the serialized Drive, Google, Sheets and media branches", () => {
    expect(outputFor("drive.import_folder").safeParse({
      ok: true,
      folderId: "folder_1",
      scanned: 1,
      imported: 1,
      skipped: 0,
      errors: [],
      assets: [{ driveFileId: "drive_1", assetId: "asset_1", name: "hero.jpg" }],
    }).success).toBe(true);
    expect(outputFor("drive.backup_now").safeParse({
      ok: true,
      file: { id: "file_1", name: "backup.json" },
      folderId: "folder_1",
      tableCount: 42,
      bytes: 2048,
    }).success).toBe(true);
    expect(outputFor("drive.backup_now").safeParse({
      ok: false,
      error: "googleDrive-feature-disabled",
    }).success).toBe(true);

    expect(outputFor("google.connect_status").safeParse({
      configured: true,
      connected: true,
      status: "connected",
      accountEmail: "owner@example.com",
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      tokenExpiresAt: ISO,
      connectedAt: ISO,
      lastError: null,
    }).success).toBe(true);

    expect(outputFor("images.search_unsplash").safeParse([{
      id: "photo_1",
      thumbUrl: "https://images.example/thumb.jpg",
      regularUrl: "https://images.example/regular.jpg",
      photographerName: "Photographer",
      photographerUrl: "https://example.com/photographer",
    }]).success).toBe(true);
    expect(outputFor("images.import_from_url").safeParse({
      url: "https://blob.example/hero.jpg",
      assetId: null,
      mime: "image/jpeg",
      sizeBytes: 1024,
      deduped: false,
    }).success).toBe(true);

    const pull = {
      ok: true,
      mode: "pull",
      skipped: 0,
      added: 1,
      updated: 0,
      errors: [],
      spreadsheetId: "sheet_1",
      finishedAt: ISO,
    };
    const push = { ...pull, mode: "push", added: 0, updated: 1 };
    expect(outputFor("sheets.pull").safeParse(pull).success).toBe(true);
    expect(outputFor("sheets.push").safeParse(push).success).toBe(true);
    expect(outputFor("sheets.sync_now").safeParse({
      ok: true,
      mode: "sync",
      skipped: 0,
      added: 1,
      updated: 1,
      errors: [],
      spreadsheetId: "sheet_1",
      finishedAt: ISO,
      pulled: pull,
      pushed: push,
    }).success).toBe(true);
  });

  it("accepts serialized GDPR, builder, scraper and UI results", () => {
    expect(outputFor("gdpr.export_user").safeParse({
      exportedAt: ISO,
      subject: {
        id: "user_1",
        email: "user@example.com",
        name: "Example User",
        phoneNumber: null,
        shippingName: null,
        shippingAddress: null,
        shippingZip: null,
        shippingCity: null,
        role: "customer",
        createdAt: ISO,
      },
      orders: [],
      guestOrdersSameEmail: [],
      reviews: [],
      subscriptions: [],
      carts: [],
      leads: [],
      acpCheckoutSessions: [],
    }).success).toBe(true);
    expect(outputFor("gdpr.erase_user").safeParse({
      ok: true,
      requestId: "erase_1",
      summary: {
        ordersAnonymized: 1,
        reviewsAnonymized: 1,
        leadsDeleted: 0,
        acpSessionsDeleted: 0,
        apiKeysRevoked: 1,
        auditIpsCleared: 2,
        userAnonymized: 1,
      },
    }).success).toBe(true);

    expect(outputFor("magic.plan_page").safeParse({
      sections: [{ key: "hero", source: "catalog", prompt: "Create a clear hero" }],
    }).success).toBe(true);
    expect(outputFor("magic.generate_page").safeParse({
      layout: {
        sections: [{
          id: "hero-0",
          key: "hero",
          enabled: true,
          props: { headline: "A clear headline" },
        }],
      },
      statuses: [
        {
          state: "done",
          key: "hero",
          source: "catalog",
          section: { key: "hero", props: { headline: "A clear headline" } },
        },
        { state: "skipped", key: "hero", source: "v0", reason: "Unavailable" },
      ],
      planned: 2,
      generated: 1,
    }).success).toBe(true);

    expect(outputFor("scraper.scrape_url").safeParse({
      name: "Coffee beans",
      description: "A balanced coffee with a chocolate finish.",
      priceKr: 129,
      attributes: [{ key: "Origin", value: "Colombia" }],
      imageUrls: ["/relative-og-image.jpg", "https://example.com/product.jpg"],
      sourceUrl: "https://example.com/product",
    }).success).toBe(true);
    expect(outputFor("ui.present_products").safeParse({
      layout: "grid",
      note: null,
      products: [{
        slug: "coffee",
        name: "Coffee",
        brand: "Example",
        priceDkk: 12900,
        stock: 5,
        firstImage: "/images/coffee.jpg",
      }],
    }).success).toBe(true);
  });

  it("rejects undeclared top-level result fields", () => {
    const result = outputFor("google.connect_status").safeParse({
      configured: false,
      connected: false,
      status: "disconnected",
      accountEmail: null,
      grantedScopes: [],
      tokenExpiresAt: null,
      connectedAt: null,
      lastError: null,
      accessToken: "must-not-be-exposed",
    });
    expect(result.success).toBe(false);
  });
});
