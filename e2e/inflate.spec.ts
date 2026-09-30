import { expect, test } from "@playwright/test";

test("letter A inflate: mesh edges default ON and warn mark at λ≥2", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();

  await page.getByRole("button", { name: "Load Letter A inflate (neo-Hookean)" }).click();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-a-desmopan")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("dynamic-pload-40ms", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Model tree").getByText(
      /fast-load \(dynamic\) OpenRadioss reference only · stretch ≤2% · volume ≤5% · pressure ≤5%\. Slow-load \(quasi-static\) is not validated\. The Inflation ABC ~54 kPa figure is not claimed\./,
    ),
  ).toBeVisible();
  await expect(page.getByText("mesh edges default ON", { exact: true })).toBeVisible();
  const pre = page.getByRole("region", { name: "Pre-processor" });
  await expect(pre.getByRole("group", { name: "Mesh shading" })).toBeVisible();
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();
  await expect(page.getByRole("img", { name: /Undeformed mesh/ })).toBeVisible();
  await page.getByRole("img", { name: /Undeformed mesh/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e/artifacts/inflate-pre.png", fullPage: true });

  await page.getByRole("button", { name: "Continue to solve" }).click();
  await expect(page.getByRole("heading", { name: "Solve — explicit dynamics" })).toBeVisible();
  await page.getByRole("button", { name: "Run solve" }).click();

  await expect(page.getByRole("heading", { name: "Post — results" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText(/Acceptance gate: PASS/)).toBeVisible();
  await expect(page.getByText("WARN  first λ_max ≥ 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /WARN\s+first λ_max ≥ 2/ })).toBeVisible();
  await expect(page.getByLabel("Solve metrics").getByText("λ_max", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("dynamic-pload-40ms", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("type19-class-gapmin-node-node", { exact: true }),
  ).toBeVisible();
  const post = page.getByRole("region", { name: "Post-processor" });
  await expect(post.getByRole("radio", { name: "Both" })).toBeChecked();
  const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
  await expect(postMesh).toBeVisible();
  await postMesh.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-warn.png", fullPage: true });
  await postMesh.screenshot({ path: "e2e/artifacts/inflate-mesh-warn.png" });

  await post.getByRole("radio", { name: "Wire" }).click();
  const wireShot = await postMesh.screenshot();
  await post.getByRole("radio", { name: "Solid" }).click();
  const solidShot = await postMesh.screenshot();
  expect(solidShot.equals(wireShot)).toBe(false);
  await post.getByRole("radio", { name: "Both" }).click();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-edges.png", fullPage: true });
});
