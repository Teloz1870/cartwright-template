import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * withAudit's `strict` option (W21-live-2a-4 R2, Codex P2): a caller with no other
 * record of what it did gets the failed audit write as its error. Without the option
 * the write failure is logged and the call's own result or error comes back, as before.
 */

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.create } } }));
vi.mock("@/lib/audit-context", () => ({ getAuditContext: () => undefined }));

import { withAudit } from "@/lib/audit";

const meta = { actor: "system:test" as const, tool: "t.run", args: {} };

describe("withAudit strict", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("off: a failed audit write is logged and the result still comes back, written once", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(withAudit(meta, async () => 42)).resolves.toBe(42);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ ok: true, tool: "t.run", afterJson: "42" });
  });

  it("off: a failed call still throws its own error when the audit write fails too", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(withAudit(meta, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ ok: false, errorMsg: "boom" });
  });

  it("on: a failed audit write after a successful call is thrown, and no second row is attempted", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(withAudit({ ...meta, strict: true }, async () => 42)).rejects.toThrow("db down");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("on: a failed audit write after a failed call names both", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(withAudit({ ...meta, strict: true }, async () => { throw new Error("boom"); })).rejects.toThrow(/audit write failed \(db down\) after the call failed: boom/);
  });

  it("on: a written audit changes nothing — result back, error rethrown as itself", async () => {
    mocks.create.mockResolvedValue({});
    await expect(withAudit({ ...meta, strict: true }, async () => 7)).resolves.toBe(7);
    const err = new Error("own");
    await expect(withAudit({ ...meta, strict: true }, async () => { throw err; })).rejects.toBe(err);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});
