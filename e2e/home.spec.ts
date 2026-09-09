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
  await expect(page.getByRole("img", { name: /Undeformed mesh/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Mesh shading" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Both" })).toBeChecked();
  const preMesh = page.getByRole("img", { name: /Undeformed mesh/ });
  await page.getByRole("radio", { name: "Wire" }).click();
  const preWire = await preMesh.screenshot();
  await page.getByRole("radio", { name: "Solid" }).click();
  const preSolid = await preMesh.screenshot();
  expect(preSolid.equals(preWire)).toBe(false);
  await page.getByRole("radio", { name: "Both" }).click();
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
  await expect(page.getByRole("img", { name: /Deformed mesh/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Energy history" })).toBeVisible();
  await expect(page.getByText("Lf / L₀")).toBeVisible();
  await expect(page.getByRole("group", { name: "Mesh shading" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Time step" });
  await expect(slider).toBeVisible();
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBeGreaterThan(1);
  await expect(page.getByText(new RegExp(`index ${String(max)} / ${String(max)}`))).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/post.png", fullPage: true });

  const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
  await page.getByRole("radio", { name: "Wire" }).click();
  const wireShot = await postMesh.screenshot();
  await page.getByRole("radio", { name: "Solid" }).click();
  const solidShot = await postMesh.screenshot();
  expect(solidShot.equals(wireShot)).toBe(false);
  await page.screenshot({ path: "e2e/artifacts/post-solid.png", fullPage: true });
  await page.getByRole("radio", { name: "Both" }).click();

  const lateShot = await postMesh.screenshot();
  await slider.fill("0");
  await expect(page.getByText(/index 0 \/ \d+ · t = 0\.0 µs/)).toBeVisible();
  const earlyShot = await postMesh.screenshot();
  expect(earlyShot.equals(lateShot)).toBe(false);
  await page.screenshot({ path: "e2e/artifacts/post-scrub.png", fullPage: true });
});
