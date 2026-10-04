import { expect, test } from "@playwright/test";

test("letter A inflate: mesh edges default ON and warn mark at first stretch ≥ 2", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-a-desmopan")).toBeVisible();
  await expect(page.getByLabel("Model tree").getByText("dynamic-pload-40ms", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Model tree").getByText(
      /fast-load \(dynamic\) open Radioss reference on a consistently outward-oriented mesh only · stretch is validated at the 16 ms freeze and lags the decks earlier in the run · volume ≤5% · pressure ≤5%\. Slow-load \(quasi-static\) is not validated\. The Inflation ABC ~54 kPa figure is not claimed\./,
    ),
  ).toBeVisible();
  const pre = page.getByRole("region", { name: "Pre-processor" });
  await expect(pre.getByRole("heading", { name: "Letter A stretch diagnostics (measurement, not a gate)" })).toBeVisible();
  await expect(
    pre.getByText("STOP: energy numbers are not trustworthy (bookkeeping failed). No verdicts."),
  ).toBeVisible();
  await expect(pre.getByRole("heading", { name: "Letter A per-step energy bookkeeping (correctness gate on the toy)" })).toBeVisible();
  await expect(pre.getByText("Results not yet written. Rules were committed first.")).toBeVisible();
  await expect(page.getByText("mesh edges default ON", { exact: true })).toBeVisible();
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
  await expect(page.getByText(/Acceptance gate: FAIL/)).toBeVisible();
  await expect(page.getByText("WARN  first stretch ≥ 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /WARN\s+first stretch ≥ 2/ })).toBeVisible();
  await expect(page.getByLabel("Solve metrics").getByText("λ_max", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("dynamic-pload-40ms", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("type19-class-gapmin-node-node", { exact: true }),
  ).toBeVisible();
  const metrics = page.getByLabel("Solve metrics");
  await expect(metrics.getByText("Punch-through", { exact: true })).toBeVisible();
  await expect(metrics.getByText("no", { exact: true })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Time step" });
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBeGreaterThan(0);
  await expect(page.getByText(new RegExp(`index ${String(max)} / ${String(max)}`))).toBeVisible();
  await expect(metrics.getByText(new RegExp(`frame ${String(max)}`))).toBeVisible();
  await expect(metrics.getByText(/λ=2\.\d/)).toBeVisible();
  const post = page.getByRole("region", { name: "Post-processor" });
  await expect(post.getByRole("radio", { name: "Both" })).toBeChecked();
  const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
  await expect(postMesh).toBeVisible();
  await postMesh.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-warn.png", fullPage: true });
  await postMesh.screenshot({ path: "e2e/artifacts/inflate-mesh-warn.png" });

  await post.getByRole("radio", { name: "Wire" }).click();
  await expect(post.getByRole("radio", { name: "Wire" })).toBeChecked();
  const wireShot = await postMesh.screenshot();
  await post.getByRole("radio", { name: "Solid" }).click();
  await expect(post.getByRole("radio", { name: "Solid" })).toBeChecked();
  const solidShot = await postMesh.screenshot();
  expect(solidShot.equals(wireShot)).toBe(false);
  await post.getByRole("radio", { name: "Both" }).click();
  await expect(post.getByRole("radio", { name: "Both" })).toBeChecked();
  await page.screenshot({ path: "e2e/artifacts/inflate-post-edges.png", fullPage: true });
});
