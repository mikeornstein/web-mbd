import { expect, test } from "@playwright/test";

test("home shows the product heading and mvp status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();
  await expect(page.getByText("mvp", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/home.png", fullPage: true });
});

test("research → pre → solve → post for Taylor stock model", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Stock models from research" })).toBeVisible();
  await page.getByRole("button", { name: "Load Taylor bar (OFHC copper)" }).click();

  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByLabel("Model tree")).toBeVisible();
  await expect(page.getByText("taylor-bar-copper")).toBeVisible();
  await expect(page.getByText("Hex elements")).toBeVisible();
  await expect(page.getByRole("img", { name: "Undeformed mesh" })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/pre.png", fullPage: true });

  await page.getByRole("button", { name: "Continue to solve" }).click();
  await expect(page.getByRole("heading", { name: "Solve — explicit dynamics" })).toBeVisible();
  await page.getByRole("button", { name: "Run solve" }).click();

  await expect(page.getByRole("heading", { name: "Post — results" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText(/Acceptance gate: PASS/)).toBeVisible();
  await expect(page.getByText("Max eq. plastic strain")).toBeVisible();
  await expect(page.getByText("Axial shortening")).toBeVisible();
  await expect(page.getByRole("img", { name: "Deformed mesh" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Energy history" })).toBeVisible();
  await expect(page.getByText("Lf / L₀")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/post.png", fullPage: true });
});
