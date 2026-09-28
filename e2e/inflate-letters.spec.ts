import { expect, test } from "@playwright/test";

test("letters B/C and QS-ish A load in pre with locks and NOT-YET goldens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();

  await page.getByRole("button", { name: "Load Letter A inflate (QS-ish dead pressure)" }).click();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-a-qs-ish")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("qs-ish-dead-pressure", { exact: true })).toBeVisible();
  await expect(page.getByText(/Radioss QS EMPTY/)).toBeVisible();
  await expect(page.getByText("mesh edges default ON", { exact: true })).toBeVisible();
  await expect(page.getByText(/TYPE19-class Gapmin/)).toBeVisible();
  const pre = page.getByRole("region", { name: "Pre-processor" });
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();
  await page.screenshot({ path: "e2e/artifacts/inflate-qs-ish-pre.png", fullPage: true });

  await page.getByRole("button", { name: "Research" }).click();
  await page.getByRole("button", { name: "Load Letter B inflate (neo-Hookean)" }).click();
  await expect(page.getByText("inflate-b-desmopan")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("B", { exact: true })).toBeVisible();
  await expect(page.getByText(/playable · OpenRadioss golden NOT-YET/)).toBeVisible();
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();
  await page.screenshot({ path: "e2e/artifacts/inflate-b-pre.png", fullPage: true });

  await page.getByRole("button", { name: "Research" }).click();
  await page.getByRole("button", { name: "Load Letter C inflate (neo-Hookean)" }).click();
  await expect(page.getByText("inflate-c-desmopan")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("C", { exact: true })).toBeVisible();
  await expect(page.getByText(/playable · OpenRadioss golden NOT-YET/)).toBeVisible();
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();
  await page.screenshot({ path: "e2e/artifacts/inflate-c-pre.png", fullPage: true });
});
