import { expect, test } from "@playwright/test";

test("home shows the product heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();
  await expect(page.getByText("greenfield")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/home.png", fullPage: true });
});
