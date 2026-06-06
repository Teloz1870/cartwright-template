import { expect, test } from "@playwright/test";

async function openAIStylist(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Åbn AI-stylist" }).click();

  const dialog = page.getByRole("dialog", { name: "AI-stylist chat" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("customer can open AI stylist and see chat-UI", async ({ page }) => {
  const dialog = await openAIStylist(page);

  await expect(dialog.getByText("Jeg er AI-stylisten på solbrillen.dk")).toBeVisible();
  await expect(
    dialog.getByPlaceholder(/Skriv et spørgsmål/),
  ).toBeVisible();
});

test("chat input sends message to API", async ({ page }) => {
  await page.route("**/api/assistant/chat", async (route) => {
    // TODO: AI SDK 6 streaming-format bør verificeres manuelt ved opgradering.
    // Denne stream matcher den simple data-stream form og testen verificerer,
    // at brugerbeskeden sendes og rendres i UI'et.
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      body: 'data: 0:"Hej!"\n\ndata: [DONE]\n\n',
    });
  });

  const dialog = await openAIStylist(page);
  await dialog.getByPlaceholder(/Skriv et spørgsmål/).fill("Hej");
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(dialog.getByText("Hej", { exact: true })).toBeVisible();
});
