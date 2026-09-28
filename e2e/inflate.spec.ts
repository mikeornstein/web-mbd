import { expect, test } from "@playwright/test";

test("letter A inflate: mesh edges default ON and warn mark at λ≥2", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();

  await page.getByRole("button", { name: "Load Letter A inflate (neo-Hookean)" }).click();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-a-desmopan")).toBeVisible();
  await expect(page.getByText("dynamic-pload-40ms")).toBeVisible();
  await expect(page.getByText("mesh edges default ON")).toBeVisible();
  await expect(page.getByRole("group", { name: "Mesh shading" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Both" })).toBeChecked();
  await expect(page.getByRole("img", { name: /Undeformed mesh/ })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/inflate-pre.png", fullPage: true });

  await page.getByRole("button", { name: "Continue to solve" }).click();
  await expect(page.getByRole("heading", { name: "Solve — explicit dynamics" })).toBeVisible();
  await page.getByRole("button", { name: "Run solve" }).click();

  await expect(page.getByRole("heading", { name: "Post — results" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText(/Acceptance gate: PASS/)).toBeVisible();
  await expect(page.getByText("WARN  first λ_max ≥ 2")).toBeVisible();
  await expect(page.getByRole("img", { name: /WARN\s+first λ_max ≥ 2/ })).toBeVisible();
  await expect(page.getByText("λ_max")).toBeVisible();
  await expect(page.getByText("dynamic-pload-40ms")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Both" })).toBeChecked();
  await expect(page.getByRole("img", { name: /Deformed mesh/ })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-warn.png", fullPage: true });

  const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
  await page.getByRole("radio", { name: "Wire" }).click();
  const wireShot = await postMesh.screenshot();
  await page.getByRole("radio", { name: "Solid" }).click();
  const solidShot = await postMesh.screenshot();
  expect(solidShot.equals(wireShot)).toBe(false);
  await page.getByRole("radio", { name: "Both" }).click();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-edges.png", fullPage: true });
});
