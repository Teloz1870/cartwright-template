import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CRON-AUTH-a: a production deploy without CRON_SECRET runs its cron jobs for
 * any caller, and the next release refuses them there. The admin says so on
 * every page, not only in the setup guide's checklist.
 */
const mocks = vi.hoisted(() => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/setup-status", () => ({ getSetupStatus: mocks.getSetupStatus }));

import SetupWarningBar from "@/components/admin/SetupWarningBar";

async function render() {
  const element = await SetupWarningBar();
  return element ? renderToStaticMarkup(element) : "";
}

describe("SetupWarningBar", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("names the open cron jobs on a production deploy without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.getSetupStatus.mockResolvedValue({ hasMissing: true, okCount: 3, totalRequired: 9 });

    const html = await render();

    expect(html).toContain("CRON_SECRET is not set: anyone can run this shop");
    expect(html).toContain("Production setup is missing configuration");
  });

  it("leaves the cron line out once CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "set");
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.getSetupStatus.mockResolvedValue({ hasMissing: true, okCount: 3, totalRequired: 9 });

    const html = await render();

    expect(html).not.toContain("CRON_SECRET");
    expect(html).toContain("Production setup is missing configuration");
  });

  it("leaves the cron line out outside production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    mocks.getSetupStatus.mockResolvedValue({ hasMissing: true, okCount: 3, totalRequired: 9 });

    expect(await render()).not.toContain("CRON_SECRET");
  });

  it("renders nothing when setup is complete and the crons are guarded", async () => {
    vi.stubEnv("CRON_SECRET", "set");
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.getSetupStatus.mockResolvedValue({ hasMissing: false, okCount: 9, totalRequired: 9 });

    expect(await render()).toBe("");
  });
});
