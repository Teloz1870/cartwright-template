import { afterEach, describe, expect, it } from "vitest";
import { configuredPublicUrl } from "@/lib/public-url";

const original = {
  app: process.env.NEXT_PUBLIC_APP_URL,
  vercelProduction: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  vercelDeployment: process.env.VERCEL_URL,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("NEXT_PUBLIC_APP_URL", original.app);
  restoreEnv("VERCEL_PROJECT_PRODUCTION_URL", original.vercelProduction);
  restoreEnv("VERCEL_URL", original.vercelDeployment);
});

describe("configuredPublicUrl", () => {
  it("uses a valid configured deployment origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.example.test/path?ignored=yes";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://demo.example.test");
  });

  it("normalizes the fallback when configuration is absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
  });

  it("uses Vercel's production domain before its per-deployment URL", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "shop.example";
    process.env.VERCEL_URL = "shop-git-preview.vercel.app";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://shop.example");
  });

  it("uses the Vercel deployment URL when no project production domain is exposed", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "shop-preview.vercel.app";
    expect(configuredPublicUrl("https://template.example/")).toBe(
      "https://shop-preview.vercel.app",
    );
  });

  it("rejects malformed and non-http configuration", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "valid-but-lower-priority.example";
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
    process.env.NEXT_PUBLIC_APP_URL = "not a URL";
    expect(configuredPublicUrl("https://template.example/")).toBe("https://template.example");
  });
});
