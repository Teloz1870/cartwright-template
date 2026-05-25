import { test, expect } from "@playwright/test";

test("admin can log in and create a product visible in the storefront", async ({
  page,
}) => {
  const slug = `e2e-test-${Date.now()}`;

  await page.goto("/konto/login");
  await page.locator('[name="email"]').fill("admin@solbrillen.dk");
  await page.locator('[name="password"]').fill("admin1234");
  await page.getByRole("button", { name: "Log ind" }).click();

  // Wait for the post-login redirect to complete (session cookie is set by then)
  // so the subsequent /admin navigation isn't bounced by middleware.
  await expect(page).toHaveURL(/\/konto$/);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/admin/produkter/nyt");
  await page.locator('[name="name"]').fill("E2E Testbrille");
  await page.locator('[name="slug"]').fill(slug);
  await page.locator('textarea[name="description"]').fill("Testbeskrivelse til E2E");
  await page.locator('[name="priceKr"]').fill("499");
  await page.locator('[name="stock"]').fill("5");
  await page.locator('[name="frameColor"]').fill("Sort");
  await page.locator('[name="lensColor"]').fill("Grå");
  await page.locator('[name="brand"]').fill("E2E");
  await page.selectOption('select[name="categoryId"]', { index: 1 });
  await page.getByRole("button", { name: "Gem produkt" }).click();

  await expect(page).toHaveURL(/\/admin\/produkter/);
  await expect(page.getByText("E2E Testbrille")).toBeVisible();

  await page.goto(`/produkt/${slug}`);
  await expect(page.getByText("E2E Testbrille")).toBeVisible();
});
