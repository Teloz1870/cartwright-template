import { test, expect } from "@playwright/test";

test("user can register, log in and view order history", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/konto/opret");
  await page.locator('[name="name"]').fill("E2E Bruger");
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill("test1234");
  await page.getByRole("button", { name: "Opret konto" }).click();

  await expect(page).toHaveURL(/\/konto\/login/);

  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill("test1234");
  await page.getByRole("button", { name: "Log ind" }).click();

  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("heading", { name: "Min konto" })).toBeVisible();

  await page.goto("/konto/ordrer");
  await expect(page.getByRole("heading", { name: "Mine ordrer" })).toBeVisible();
});
