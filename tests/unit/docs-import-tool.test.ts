import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { ToolCtx } from "@/lib/tools/types";

// Mock the data + side-effect layers so we can assert the tool's behaviour
// (bodyFormat provenance + idempotent slug) without a DB or Google connection.
vi.mock("@/lib/db", () => ({
  prisma: {
    page: { update: vi.fn() },
    post: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/google/docs", () => ({
  fetchGoogleDoc: vi.fn(),
}));
vi.mock("@/lib/tools/pages", () => ({
  upsertPage: { handler: vi.fn() },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: (_meta: unknown, fn: () => unknown) => fn(),
}));

import { prisma } from "@/lib/db";
import { fetchGoogleDoc } from "@/lib/google/docs";
import { upsertPage } from "@/lib/tools/pages";
import { importGoogleDoc } from "@/lib/tools/docs";

const fetchDocMock = fetchGoogleDoc as unknown as Mock;
const upsertPageMock = upsertPage.handler as unknown as Mock;
const pageUpdateMock = prisma.page.update as unknown as Mock;
const postFindUniqueMock = prisma.post.findUnique as unknown as Mock;
const postCreateMock = prisma.post.create as unknown as Mock;

const ctx: ToolCtx = { actor: "user:test", requestId: "req-1" };

beforeEach(() => {
  vi.clearAllMocks();
  fetchDocMock.mockResolvedValue({
    ok: true,
    document: {},
    title: "My Doc",
    markdown: "## Heading\n\nBody text",
  });
});

describe("docs.import tool", () => {
  it("page import stores body as bodyFormat='text' and is idempotent by slug", async () => {
    upsertPageMock.mockResolvedValue({ id: "p1", slug: "my-doc", title: "My Doc" });
    pageUpdateMock.mockResolvedValue({});

    const first = await importGoogleDoc.handler({ documentId: "d1", target: "page" }, ctx);
    const second = await importGoogleDoc.handler({ documentId: "d1", target: "page" }, ctx);

    // Idempotent: both imports upsert the SAME slug (no duplicate page).
    expect(upsertPageMock.mock.calls[0][0].slug).toBe("my-doc");
    expect(upsertPageMock.mock.calls[1][0].slug).toBe("my-doc");
    expect((first as { slug: string }).slug).toBe((second as { slug: string }).slug);

    // Provenance marker set to text (markdown), never html.
    expect(pageUpdateMock).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { bodyFormat: "text" },
    });

    // Body is the converted markdown, not raw HTML.
    expect(upsertPageMock.mock.calls[0][0].body).toBe("## Heading\n\nBody text");
  });

  it("post import stores bodyFormat='text'", async () => {
    postFindUniqueMock.mockResolvedValue(null); // slug is free
    postCreateMock.mockResolvedValue({ id: "po1", slug: "my-doc", title: "My Doc" });

    await importGoogleDoc.handler({ documentId: "d1", target: "post" }, ctx);

    expect(postCreateMock).toHaveBeenCalledTimes(1);
    expect(postCreateMock.mock.calls[0][0].data.bodyFormat).toBe("text");
    expect(postCreateMock.mock.calls[0][0].data.body).toBe("## Heading\n\nBody text");
  });

  it("fail-soft: throws a clear error when Google is not connected", async () => {
    fetchDocMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_connected", message: "Google is not connected." },
    });
    await expect(
      importGoogleDoc.handler({ documentId: "d1", target: "page" }, ctx),
    ).rejects.toThrow(/not connected/i);
  });
});
