import { expect, test } from "@playwright/test";

test("letter B is an unvalidated demo; letter C is not listed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();

  await page.getByRole("button", { name: "Research" }).click();
  await expect(page.getByRole("button", { name: "Load Letter B inflate (unvalidated demo)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Letter C/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Load Letter B inflate (unvalidated demo)" }).click();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-b-desmopan")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("B", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Model tree").getByText(
      /unvalidated demo · OpenRadioss golden NOT-YET\. Slow-load \(quasi-static\) is not validated\. The Inflation ABC ~54 kPa figure is not claimed\./,
    ),
  ).toBeVisible();
  const pre = page.getByRole("region", { name: "Pre-processor" });
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();
  await page.screenshot({ path: "e2e/artifacts/inflate-b-pre.png", fullPage: true });
});
