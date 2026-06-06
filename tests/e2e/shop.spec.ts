import { test, expect } from "@playwright/test";

test("guest can browse, add to cart and check out", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sommeren starter her" }),
  ).toBeVisible();

  await page.goto("/produkter");
  const firstProductLink = page.locator('a[href^="/produkt/"]').first();
  await expect(firstProductLink).toBeVisible();

  await firstProductLink.click();
  await expect(page).toHaveURL(/\/produkt\//);
  await expect(page.getByRole("button", { name: "Læg i kurv" })).toBeVisible();

  await page.getByRole("button", { name: "Læg i kurv" }).click();
  // Wait for the add-to-cart server action to complete (button shows success state).
  await expect(page.getByRole("button", { name: /lagt i kurv/i })).toBeVisible();

  await page.goto("/kurv");
  await expect(page.getByRole("link", { name: "Gå til checkout" })).toBeVisible();
  await expect(page.getByText("Din kurv er tom")).toHaveCount(0);

  await page.getByRole("link", { name: "Gå til checkout" }).click();
  await page.locator('[name="shippingName"]').fill("Test Testesen");
  await page.locator('[name="email"]').fill("guest@example.com");
  await page.locator('[name="shippingAddress"]').fill("Testvej 1");
  await page.locator('[name="shippingZip"]').fill("1234");
  await page.locator('[name="shippingCity"]').fill("Testby");
  await page.getByRole("button", { name: "Gennemfør køb" }).click();

  await expect(page).toHaveURL(/\/ordre\//);
  await expect(
    page.getByRole("heading", { name: "Tak for din ordre!" }),
  ).toBeVisible();
});
