import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// DRØM26-b nits: the phone plugin's admin and token routes wrote the IVR text
// and the raw error object to the server log.

vi.mock("@/lib/admin", () => ({ requireAdminApi: async () => ({ user: { id: "admin" } }) }));

import { POST as adminPost } from "@/plugins/phone-widget/api/admin";
import { POST as tokenPost } from "@/plugins/phone-widget/api/token";

const IVR = "Tryk 1 for Jens Hansen på +4520123456";
let spies: MockInstance[] = [];

beforeEach(() => {
  spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const s of spies) s.mockRestore();
  vi.restoreAllMocks();
});

function logged(): string {
  return spies
    .flatMap((s) => s.mock.calls)
    .flat()
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack ?? ""}` : String(a)))
    .join("\n");
}

describe("phone plugin — no customer text or raw errors in the log", () => {
  it("the IVR sync logs the text's length, not the text", async () => {
    const res = await adminPost(
      new Request("https://shop.example.com/api/admin/phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ivrText: IVR }),
      }),
    );
    expect(res.status).toBe(200);
    const out = logged();
    expect(out).toContain(`(${IVR.length} characters)`);
    expect(out).not.toContain("Jens Hansen");
    expect(out).not.toContain("20123456");
  });

  it("a failing token request logs the error's name, not its message", async () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new RangeError("upstream said: caller +4520123456");
    });
    const res = await tokenPost();
    expect(res.status).toBe(500);
    const out = logged();
    expect(out).toContain("Failed to generate Phone.inc token: RangeError");
    expect(out).not.toContain("20123456");
  });
});
